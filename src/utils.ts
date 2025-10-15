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
 * Utility functions for Slabby using Effect
 */

import { Effect } from "effect";

/**
 * Error for invalid post ID extraction
 */
export class InvalidPostIdError {
  readonly _tag = "InvalidPostIdError";
  constructor(readonly message: string) {}
}

/**
 * Extracts a post ID from either a URL or a direct ID string
 * @param input - Either a Slab post URL (e.g., "https://team.slab.com/posts/abc123") or a post ID
 * @returns Effect containing the extracted post ID or an error
 */
export function extractPostId(input: string): Effect.Effect<string, InvalidPostIdError> {
  return Effect.gen(function* () {
    // If it's a URL, extract the post ID from the path
    if (input.startsWith("http")) {
      const url = yield* Effect.try({
        try: () => new URL(input),
        catch: (error) => new InvalidPostIdError(`Invalid URL: ${error}`),
      });

      const pathParts = url.pathname.split("/");
      const postId = pathParts[pathParts.length - 1];

      if (!postId) {
        return yield* Effect.fail(new InvalidPostIdError("Could not extract post ID from URL"));
      }

      return postId;
    }

    // Otherwise, assume it's already a post ID
    return input;
  });
}
