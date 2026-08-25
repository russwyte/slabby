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

import { Context, Effect, Layer, Data } from "effect";
import type { SlabPost, SlabSearchResult, SlabListResult } from "./types.ts";
import { ConfigService } from "./config.ts";
import {
  GET_POST_QUERY,
  UPDATE_POST_CONTENT_MUTATION,
  SEARCH_POSTS_QUERY,
  GET_TOPIC_POSTS_QUERY,
  GET_ORGANIZATION_POSTS_QUERY,
} from "./graphql.ts";
import { contentToMarkdown, DeltaConversionError } from "./deltaToMarkdown.ts";

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
type SlabError = SlabApiError | SlabNetworkError | DeltaConversionError;

export interface SlabClientService {
  readonly getPost: (postId: string) => Effect.Effect<SlabPost, SlabError>;
  readonly updatePost: (postId: string, content: string) => Effect.Effect<SlabPost, SlabError>;
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
 * Create a delta operation to replace all content
 * First deletes everything, then inserts new content
 */
const createReplacementDelta = (currentContent: any, newText: string): any => {
  // Calculate current content length
  const currentLength = Array.isArray(currentContent)
    ? currentContent.reduce((sum: number, op: any) => {
        if (typeof op.insert === "string") return sum + op.insert.length;
        return sum + 1; // embeds count as 1 character
      }, 0)
    : 0;

  // Ensure new text ends with double newline
  const normalizedText = newText.endsWith("\n\n") ? newText : newText + "\n\n";

  return {
    ops: [
      ...(currentLength > 0 ? [{ delete: currentLength }] : []),
      { insert: normalizedText },
    ],
  };
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

    return {
      getPost: (postId: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ post: any }>(graphqlUrl, apiToken, {
            query: GET_POST_QUERY,
            variables: { id: postId },
          });
          return yield* transformPost(data.post, team);
        }),

      updatePost: (postId: string, content: string) =>
        Effect.gen(function* () {
          const currentData = yield* makeGraphQLRequest<{ post: any }>(graphqlUrl, apiToken, {
            query: GET_POST_QUERY,
            variables: { id: postId },
          });

          const delta = createReplacementDelta(currentData.post.content, content);

          const updateData = yield* makeGraphQLRequest<{ updatePostContent: any }>(graphqlUrl, apiToken, {
            query: UPDATE_POST_CONTENT_MUTATION,
            variables: { id: postId, delta },
          });

          return yield* transformPost(updateData.updatePostContent, team);
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
