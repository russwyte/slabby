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

import { Context, Effect, Layer } from "effect";
import type { SlabPost, SlabSearchResult, SlabListResult } from "./types.ts";
import { ConfigService } from "./config.ts";
import {
  GET_POST_QUERY,
  UPDATE_POST_CONTENT_MUTATION,
  SEARCH_POSTS_QUERY,
  GET_TOPIC_POSTS_QUERY,
  GET_ORGANIZATION_POSTS_QUERY,
} from "./graphql.ts";

/**
 * Error types for Slab API operations
 */
export class SlabApiError {
  readonly _tag = "SlabApiError";
  constructor(
    readonly message: string,
    readonly status?: number,
    readonly graphqlErrors?: any[]
  ) {}
}

export class SlabNetworkError {
  readonly _tag = "SlabNetworkError";
  constructor(
    readonly message: string,
    readonly cause?: unknown
  ) {}
}

/**
 * Slab client service interface
 */
export interface SlabClientService {
  readonly getPost: (postId: string) => Effect.Effect<SlabPost, SlabApiError | SlabNetworkError>;
  readonly updatePost: (postId: string, content: string) => Effect.Effect<SlabPost, SlabApiError | SlabNetworkError>;
  readonly searchPosts: (query: string) => Effect.Effect<SlabSearchResult, SlabApiError | SlabNetworkError>;
  readonly listPosts: (topicId?: string) => Effect.Effect<SlabListResult, SlabApiError | SlabNetworkError>;
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
            // Slab uses "Authorization: token <TOKEN>" not "Bearer"
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }),
      catch: (error) => new SlabNetworkError(`Network error: ${error}`, error),
    });

    // Check if response is ok
    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => new SlabNetworkError(`Unable to read error response: ${error}`, error),
      });
      return yield* Effect.fail(
        new SlabApiError(`Slab GraphQL API error (${response.status}): ${errorText}`, response.status)
      );
    }

    // Parse JSON response
    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<GraphQLResponse<T>>,
      catch: (error) => new SlabNetworkError(`Failed to parse JSON response: ${error}`, error),
    });

    // Check for GraphQL errors
    if (json.errors && json.errors.length > 0) {
      const errorMessages = json.errors.map((e) => e.message).join(", ");
      return yield* Effect.fail(
        new SlabApiError(`GraphQL errors: ${errorMessages}`, response.status, json.errors)
      );
    }

    // Check for data
    if (!json.data) {
      return yield* Effect.fail(new SlabApiError("GraphQL response missing data field", response.status));
    }

    return json.data;
  });

/**
 * Convert Quill Delta JSON content to plain text
 * Slab stores content in Quill Delta format
 */
const deltaToPlainText = (delta: any): string => {
  if (!delta || !Array.isArray(delta)) return "";
  return delta
    .map((op: any) => {
      if (typeof op.insert === "string") {
        return op.insert;
      }
      return "";
    })
    .join("");
};

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
 */
const transformPost = (post: any): SlabPost => {
  // Convert Delta JSON content to plain text for easier consumption
  const contentText = typeof post.content === "string" ? post.content : deltaToPlainText(post.content);

  return {
    id: post.id,
    title: post.title,
    content: contentText,
    url: post.url || `https://slab.com/posts/${post.id}`, // Construct URL if not provided
    created_at: post.insertedAt, // Slab uses insertedAt
    updated_at: post.updatedAt,
    created_by: post.owner
      ? {
          id: post.owner.id,
          display_name: post.owner.name,
          email: post.owner.email,
        }
      : undefined,
  };
};

/**
 * Live Slab GraphQL client implementation
 */
export const SlabClientServiceLive = Layer.effect(
  SlabClientService,
  Effect.gen(function* () {
    const { config } = yield* ConfigService;
    const { graphqlUrl, apiToken } = config;

    return {
      getPost: (postId: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ post: any }>(graphqlUrl, apiToken, {
            query: GET_POST_QUERY,
            variables: { id: postId },
          });
          return transformPost(data.post);
        }),

      updatePost: (postId: string, content: string) =>
        Effect.gen(function* () {
          // First, get the current post to calculate the replacement delta
          const currentData = yield* makeGraphQLRequest<{ post: any }>(graphqlUrl, apiToken, {
            query: GET_POST_QUERY,
            variables: { id: postId },
          });

          // Create delta that replaces all content
          const delta = createReplacementDelta(currentData.post.content, content);

          // Update the post content
          const updateData = yield* makeGraphQLRequest<{ updatePostContent: any }>(graphqlUrl, apiToken, {
            query: UPDATE_POST_CONTENT_MUTATION,
            variables: { id: postId, delta },
          });

          return transformPost(updateData.updatePostContent);
        }),

      searchPosts: (query: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ search: any }>(graphqlUrl, apiToken, {
            query: SEARCH_POSTS_QUERY,
            variables: { query, first: 20 }, // Get first 20 results
          });

          // Extract posts from search edges
          const posts =
            data.search.edges?.map((edge: any) => {
              if (edge.node && edge.node.post) {
                return transformPost(edge.node.post);
              }
              return null;
            }).filter(Boolean) || [];

          return {
            posts,
            total_count: posts.length, // Total count not directly available in cursor pagination
          };
        }),

      listPosts: (topicId?: string) =>
        Effect.gen(function* () {
          if (topicId) {
            // Get posts for specific topic
            const data = yield* makeGraphQLRequest<{ topic: any }>(graphqlUrl, apiToken, {
              query: GET_TOPIC_POSTS_QUERY,
              variables: { topicId },
            });

            const posts = (data.topic.posts || []).map(transformPost);
            return {
              posts,
              total_count: posts.length,
            };
          } else {
            // Get all organization posts
            const data = yield* makeGraphQLRequest<{ organization: any }>(graphqlUrl, apiToken, {
              query: GET_ORGANIZATION_POSTS_QUERY,
              variables: {},
            });

            const posts = (data.organization.posts || []).map(transformPost);
            return {
              posts,
              total_count: posts.length,
            };
          }
        }),
    };
  })
);
