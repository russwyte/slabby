/**
 * Copyright 2025 Russ White
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Slab GraphQL API client using Effect
 *
 * ✅ Updated to match actual Slab GraphQL schema
 */

import { Context, Effect, Layer, Data, Schedule } from "effect";
import type { SlabPost, SlabSearchResult, SlabListResult } from "./types.ts";
import { ConfigService } from "./config.ts";
import {
  GET_POST_QUERY,
  UPDATE_POST_CONTENT_MUTATION,
  SET_POST_PUBLISHED_MUTATION,
  CREATE_PROBE_POST_MUTATION,
  DELETE_POST_MUTATION,
  SEARCH_POSTS_QUERY,
  GET_TOPIC_POSTS_QUERY,
  GET_ORGANIZATION_POSTS_QUERY,
} from "./graphql.ts";
import { contentToMarkdown, normalizeOps, DeltaConversionError } from "./deltaToMarkdown.ts";
import {
  markdownToOps,
  deltaLength,
  endsWithNewline,
  MarkdownConversionError,
} from "./markdownToDelta.ts";

export class SlabApiError extends Data.TaggedError("SlabApiError")<{
  readonly message: string;
  readonly status?: number;
  readonly graphqlErrors?: any[];
}> {}

export class SlabNetworkError extends Data.TaggedError("SlabNetworkError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Slab client service interface
 */
type SlabError = SlabApiError | SlabNetworkError | DeltaConversionError | MarkdownConversionError;

export interface SlabClientService {
  readonly getPost: (postId: string) => Effect.Effect<SlabPost, SlabError>;
  readonly updatePost: (postId: string, content: string) => Effect.Effect<SlabPost, SlabError>;
  readonly appendToPost: (postId: string, content: string) => Effect.Effect<SlabPost, SlabError>;
  readonly searchPosts: (query: string) => Effect.Effect<SlabSearchResult, SlabError>;
  readonly listPosts: (topicId?: string) => Effect.Effect<SlabListResult, SlabError>;
}

/**
 * Slab client context tag
 */
export const SlabClientService = Context.GenericTag<SlabClientService>("@services/SlabClientService");

/**
 * GraphQL request structure
 */
interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
}

/**
 * GraphQL response structure
 */
interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: any;
  }>;
}

/**
 * Make a GraphQL request to the Slab API
 */
const makeGraphQLRequest = <T>(
  apiUrl: string,
  token: string,
  request: GraphQLRequest
): Effect.Effect<T, SlabApiError | SlabNetworkError> =>
  Effect.gen(function* () {
    // Attempt the fetch operation
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(apiUrl, {
          method: "POST",
          headers: {
            // Slab API accepts "Authorization: Bearer <TOKEN>"
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }),
      catch: (error) => new SlabNetworkError({ message: `Network error: ${error}`, cause: error }),
    });

    // Check if response is ok
    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => new SlabNetworkError({ message: `Unable to read error response: ${error}`, cause: error }),
      });
      return yield* Effect.fail(
        new SlabApiError({ message: `Slab GraphQL API error (${response.status}): ${errorText}`, status: response.status })
      );
    }

    // Parse JSON response
    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<GraphQLResponse<T>>,
      catch: (error) => new SlabNetworkError({ message: `Failed to parse JSON response: ${error}`, cause: error }),
    });

    // Check for GraphQL errors
    if (json.errors && json.errors.length > 0) {
      const errorMessages = json.errors.map((e) => e.message).join(", ");
      return yield* Effect.fail(
        new SlabApiError({ message: `GraphQL errors: ${errorMessages}`, status: response.status, graphqlErrors: json.errors })
      );
    }

    // Check for data
    if (!json.data) {
      return yield* Effect.fail(new SlabApiError({ message: "GraphQL response missing data field", status: response.status }));
    }

    return json.data;
  });

/**
 * True when a string parses as JSON (any JSON value).
 */
const isJsonString = (value: string): boolean => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Existing post content as delta ops. The API returns content as a
 * JSON-encoded Delta string; normalizeOps handles decoding — without it the
 * length would be 0 and a replace would prepend instead of replacing. A plain
 * non-JSON string (legacy shape) counts as a single text insert; a string that
 * IS JSON but decodes to no ops (e.g. "[]") is genuinely empty.
 */
const contentOps = (content: any): Array<{ insert?: any }> => {
  const ops = normalizeOps(content);
  if (ops.length > 0) return ops;
  if (typeof content === "string" && content.length > 0 && !isJsonString(content)) {
    return [{ insert: content }];
  }
  return [];
};

/** Stable snapshot key for a post's raw content value. */
const contentSnapshot = (content: any): string =>
  typeof content === "string" ? content : JSON.stringify(content ?? null);

interface BuiltDelta {
  delta: { ops: any[] };
  /** The draft ops this delta produces when applied to the base. */
  draftOps: any[];
}

/**
 * Create a delta that replaces all content: delete everything, then insert
 * the new content converted from markdown to Slab's delta dialect.
 */
const createReplacementDelta = (baseOps: any[], markdown: string): BuiltDelta => {
  const baseLength = deltaLength(baseOps);
  const newOps = markdownToOps(markdown);

  return {
    delta: {
      ops: [...(baseLength > 0 ? [{ delete: baseLength }] : []), ...newOps],
    },
    draftOps: newOps,
  };
};

/**
 * Create a delta that appends markdown-converted content to the end of the
 * post without touching existing content: retain everything, then insert.
 */
const createAppendDelta = (baseOps: any[], markdown: string): BuiltDelta => {
  const baseLength = deltaLength(baseOps);
  const separator = endsWithNewline(baseOps) ? [] : [{ insert: "\n" }];
  const newOps = markdownToOps(markdown);

  return {
    delta: {
      ops: [
        ...(baseLength > 0 ? [{ retain: baseLength }] : []),
        // Keep the appended content on its own line
        ...separator,
        ...newOps,
      ],
    },
    draftOps: [...baseOps, ...separator, ...newOps],
  };
};

/**
 * Cache of the token user's id, shared across layer builds. The Slab API has
 * no viewer/me query, so identity is discovered once by creating a probe post
 * (its owner is the token user) and deleting it immediately.
 */
let cachedTokenUserId: string | null | undefined;

/**
 * updatePostContent applies deltas to the DRAFT, but the API only lets us read
 * the PUBLISHED revision — sizing a delta against published content corrupts a
 * diverged draft. For posts we cannot republish (pendingPublish flow), track
 * the draft we composed, keyed to the published-content snapshot it was based
 * on; when the published content changes (e.g. a human published our draft)
 * the entry is stale and dropped.
 */
const draftCache = new Map<string, { publishedSnapshot: string; draftOps: any[] }>();

/** Test hook: clear module-level caches so tests are order-independent. */
export const __resetWriteCachesForTests = (): void => {
  cachedTokenUserId = undefined;
  draftCache.clear();
};

/**
 * Transform GraphQL post response to SlabPost type
 * Uses actual Slab schema field names: insertedAt, publishedAt, owner
 *
 * The Slab Post type has no url field, so the url is constructed from the
 * configured team subdomain.
 */
const transformPost = (post: any, team: string): Effect.Effect<SlabPost, DeltaConversionError> =>
  Effect.gen(function* () {
    const contentText = yield* contentToMarkdown(post.content);

    return {
      id: post.id,
      title: post.title,
      content: contentText,
      url: `https://${team}.slab.com/posts/${post.id}`,
      created_at: post.insertedAt,
      updated_at: post.updatedAt,
      created_by: post.owner
        ? {
            id: post.owner.id,
            display_name: post.owner.name,
            email: post.owner.email,
          }
        : undefined,
    };
  });

/**
 * Live Slab GraphQL client implementation
 */
export const SlabClientServiceLive = Layer.effect(
  SlabClientService,
  Effect.gen(function* () {
    const { config } = yield* ConfigService;
    const { graphqlUrl, apiToken, team } = config;

    const getTokenUserId = Effect.gen(function* () {
      if (cachedTokenUserId !== undefined) return cachedTokenUserId;
      const created = yield* makeGraphQLRequest<{ createPost: any }>(graphqlUrl, apiToken, {
        query: CREATE_PROBE_POST_MUTATION,
        variables: { title: "slabby identity probe (auto-deleted)" },
      }).pipe(
        Effect.map((data) => ({ ok: true as const, data })),
        Effect.catchAll((error) => Effect.succeed({ ok: false as const, error }))
      );
      if (!created.ok) {
        // Cache only definitive denials; a transient failure must not
        // permanently misroute own-post writes into the pendingPublish path.
        if (String((created.error as any)?.message ?? "").includes("FORBIDDEN")) {
          cachedTokenUserId = null;
        }
        return null;
      }
      const probe = created.data.createPost;
      cachedTokenUserId = probe?.owner?.id ?? null;
      if (probe?.id) {
        yield* makeGraphQLRequest(graphqlUrl, apiToken, {
          query: DELETE_POST_MUTATION,
          variables: { id: probe.id },
        }).pipe(Effect.retry({ times: 1 }), Effect.catchAll(() => Effect.succeed(null)));
      }
      return cachedTokenUserId;
    });

    const getPostRaw = (postId: string) =>
      Effect.gen(function* () {
        const data = yield* makeGraphQLRequest<{ post: any }>(graphqlUrl, apiToken, {
          query: GET_POST_QUERY,
          variables: { id: postId },
        });
        return data.post;
      });

    const setPublished = (postId: string, published: boolean) =>
      makeGraphQLRequest<{ updatePost: any }>(graphqlUrl, apiToken, {
        query: SET_POST_PUBLISHED_MUTATION,
        variables: { id: postId, published },
      });

    // Republish after an unpublish MUST succeed or the post stays hidden.
    // Retry with exponential backoff so transient failures (rate limits,
    // blips) are actually covered, and if it still fails say exactly what
    // state the post was left in.
    const republishOrExplain = (postId: string) =>
      setPublished(postId, true).pipe(
        Effect.retry(Schedule.intersect(Schedule.exponential("250 millis"), Schedule.recurs(4))),
        Effect.mapError(
          (error) =>
            new SlabApiError({
              message: `Republish failed after retries — the post ${postId} has been left UNPUBLISHED and is hidden until someone republishes it in the Slab UI. Underlying error: ${
                (error as any)?.message ?? String(error)
              }`,
            })
        )
      );

    // updatePostContent writes to the post's DRAFT, but post.content only ever
    // returns the PUBLISHED revision (verified live) — so delta offsets sized
    // from post.content corrupt any draft that has diverged. performWrite
    // handles the three post states:
    //
    // - Never-published post: size against the visible content, edit, then
    //   updatePost(published: true) promotes the draft.
    // - Published post owned by the TOKEN USER: unpublish→republish FIRST to
    //   flush any pre-existing draft (e.g. autosaved edits) into the published
    //   revision, so sizing is exact; then edit; then toggle again to promote.
    // - Published post owned by SOMEONE ELSE: unpublish succeeds but republish
    //   is FORBIDDEN, which would strand the post hidden. NEVER toggle here —
    //   the edit lands in the draft (pendingPublish) and the draft we composed
    //   is cached so follow-up writes in this process size correctly.
    const performWrite = (postId: string, markdown: string, mode: "replace" | "append") =>
      Effect.gen(function* () {
        let current = yield* getPostRaw(postId);
        const isPublished = current.publishedAt != null;
        let owned = false;

        if (isPublished) {
          const userId = yield* getTokenUserId;
          owned = userId != null && current.owner?.id === userId;
          if (owned) {
            // Flush the draft so published == draft and offsets are exact.
            yield* setPublished(postId, false);
            yield* republishOrExplain(postId);
            draftCache.delete(postId);
            current = yield* getPostRaw(postId);
          }
        }

        const snapshot = contentSnapshot(current.content);
        const cached = draftCache.get(postId);
        const baseOps =
          cached && cached.publishedSnapshot === snapshot
            ? cached.draftOps
            : (draftCache.delete(postId), contentOps(current.content));

        const built =
          mode === "replace"
            ? createReplacementDelta(baseOps, markdown)
            : createAppendDelta(baseOps, markdown);

        // Slab's Json scalar expects a JSON-encoded string, mirroring how
        // post content is returned. Sending a raw object fails Absinthe
        // validation with `In field "ops": Unknown field`.
        yield* makeGraphQLRequest<{ updatePostContent: any }>(graphqlUrl, apiToken, {
          query: UPDATE_POST_CONTENT_MUTATION,
          variables: { id: postId, delta: JSON.stringify(built.delta) },
        });

        if (!isPublished) {
          const published = yield* setPublished(postId, true);
          draftCache.delete(postId);
          return yield* transformPost(published.updatePost, team);
        }

        if (owned) {
          yield* setPublished(postId, false);
          const published = yield* republishOrExplain(postId);
          draftCache.delete(postId);
          return yield* transformPost(published.updatePost, team);
        }

        draftCache.set(postId, { publishedSnapshot: snapshot, draftOps: built.draftOps });
        const fresh = yield* getPostRaw(postId);
        const result = yield* transformPost(fresh, team);
        return { ...result, pendingPublish: true };
      });

    return {
      getPost: (postId: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ post: any }>(graphqlUrl, apiToken, {
            query: GET_POST_QUERY,
            variables: { id: postId },
          });
          return yield* transformPost(data.post, team);
        }),

      updatePost: (postId: string, content: string) => performWrite(postId, content, "replace"),

      appendToPost: (postId: string, content: string) =>
        Effect.gen(function* () {
          // Appending nothing would only create a blank paragraph
          if (content.trim() === "") {
            const post = yield* getPostRaw(postId);
            return yield* transformPost(post, team);
          }
          return yield* performWrite(postId, content, "append");
        }),

      searchPosts: (query: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ search: any }>(graphqlUrl, apiToken, {
            query: SEARCH_POSTS_QUERY,
            variables: { query, first: 20 },
          });

          const edges: any[] = data.search.edges || [];
          const postEffects = edges
            .filter((edge: any) => edge.node?.post)
            .map((edge: any) =>
              transformPost(edge.node.post, team).pipe(
                Effect.map((post) => ({ ...post, snippet: edge.node.highlight || undefined }))
              )
            );
          const posts: SlabPost[] = yield* Effect.all(postEffects);

          return {
            posts,
            total_count: posts.length,
          };
        }),

      listPosts: (topicId?: string) =>
        Effect.gen(function* () {
          if (topicId) {
            const data = yield* makeGraphQLRequest<{ topic: any }>(graphqlUrl, apiToken, {
              query: GET_TOPIC_POSTS_QUERY,
              variables: { topicId },
            });

            const rawPosts: any[] = data.topic.posts || [];
            const posts: SlabPost[] = yield* Effect.all(rawPosts.map((p) => transformPost(p, team)));
            return { posts, total_count: posts.length };
          } else {
            const data = yield* makeGraphQLRequest<{ organization: any }>(graphqlUrl, apiToken, {
              query: GET_ORGANIZATION_POSTS_QUERY,
              variables: {},
            });

            const rawPosts: any[] = data.organization.posts || [];
            const posts: SlabPost[] = yield* Effect.all(rawPosts.map((p) => transformPost(p, team)));
            return { posts, total_count: posts.length };
          }
        }),
    };
  })
);
