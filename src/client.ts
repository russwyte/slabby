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
 */

import { Context, Effect, Layer } from "effect";
import type { SlabPost, SlabSearchResult, SlabListResult } from "./types.ts";
import { ConfigService } from "./config.ts";
import {
  GET_POST_QUERY,
  UPDATE_POST_MUTATION,
  SEARCH_POSTS_QUERY,
  LIST_POSTS_QUERY,
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
            // NOTE: Slab uses "Authorization: token <TOKEN>" not "Bearer"
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
 * Transform GraphQL post response to SlabPost type
 * Handles different casing conventions (camelCase vs snake_case)
 */
const transformPost = (post: any): SlabPost => ({
  id: post.id,
  title: post.title,
  content: post.content || post.body || "",
  url: post.url,
  created_at: post.createdAt || post.created_at,
  updated_at: post.updatedAt || post.updated_at,
  created_by: post.createdBy || post.created_by
    ? {
        id: (post.createdBy || post.created_by).id,
        display_name: (post.createdBy || post.created_by).displayName || (post.createdBy || post.created_by).display_name,
        email: (post.createdBy || post.created_by).email,
      }
    : undefined,
  updated_by: post.updatedBy || post.updated_by
    ? {
        id: (post.updatedBy || post.updated_by).id,
        display_name: (post.updatedBy || post.updated_by).displayName || (post.updatedBy || post.updated_by).display_name,
        email: (post.updatedBy || post.updated_by).email,
      }
    : undefined,
});

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
          const data = yield* makeGraphQLRequest<{ updatePost: { post: any } }>(graphqlUrl, apiToken, {
            query: UPDATE_POST_MUTATION,
            variables: { id: postId, content },
          });
          return transformPost(data.updatePost.post);
        }),

      searchPosts: (query: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ search: any }>(graphqlUrl, apiToken, {
            query: SEARCH_POSTS_QUERY,
            variables: { query },
          });

          return {
            posts: (data.search.posts || []).map(transformPost),
            total_count: data.search.totalCount || data.search.total_count,
          };
        }),

      listPosts: (topicId?: string) =>
        Effect.gen(function* () {
          const data = yield* makeGraphQLRequest<{ posts: any }>(graphqlUrl, apiToken, {
            query: LIST_POSTS_QUERY,
            variables: topicId ? { topicId } : {},
          });

          // Handle different response structures
          const posts = data.posts.items || data.posts || [];
          const totalCount = data.posts.totalCount || data.posts.total_count;

          return {
            posts: posts.map(transformPost),
            total_count: totalCount,
          };
        }),
    };
  })
);
