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
 * Slab API client using Effect
 */

import { Context, Effect, Layer } from "effect";
import type { SlabPost, SlabSearchResult, SlabListResult } from "./types.ts";
import { ConfigService } from "./config.ts";

/**
 * Error types for Slab API operations
 */
export class SlabApiError {
  readonly _tag = "SlabApiError";
  constructor(
    readonly message: string,
    readonly status?: number
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
 * Make an authenticated request to the Slab API
 */
const makeRequest = (
  baseUrl: string,
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Effect.Effect<any, SlabApiError | SlabNetworkError> =>
  Effect.gen(function* () {
    const url = `${baseUrl}${endpoint}`;

    // Attempt the fetch operation
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        }),
      catch: (error) => new SlabNetworkError(`Network error: ${error}`, error),
    });

    // Check if response is ok
    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => new SlabNetworkError(`Unable to read error response: ${error}`, error),
      });
      return yield* Effect.fail(new SlabApiError(`Slab API error (${response.status}): ${errorText}`, response.status));
    }

    // Parse JSON response
    return yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new SlabNetworkError(`Failed to parse JSON response: ${error}`, error),
    });
  });

/**
 * Live Slab client implementation
 */
export const SlabClientServiceLive = Layer.effect(
  SlabClientService,
  Effect.gen(function* () {
    const { config } = yield* ConfigService;
    const { baseUrl, apiToken } = config;

    return {
      getPost: (postId: string) => makeRequest(baseUrl, apiToken, `/posts/${postId}`),

      updatePost: (postId: string, content: string) =>
        makeRequest(baseUrl, apiToken, `/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({ content }),
        }),

      searchPosts: (query: string) => {
        const params = new URLSearchParams({ query });
        return makeRequest(baseUrl, apiToken, `/search?${params}`);
      },

      listPosts: (topicId?: string) => {
        const params = topicId ? `?topic_id=${topicId}` : "";
        return makeRequest(baseUrl, apiToken, `/posts${params}`);
      },
    };
  })
);
