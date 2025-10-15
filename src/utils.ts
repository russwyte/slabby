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
 * Utility functions for Slabby
 */

/**
 * Extracts a post ID from either a URL or a direct ID string
 * @param input - Either a Slab post URL (e.g., "https://team.slab.com/posts/abc123") or a post ID
 * @returns The extracted post ID
 * @throws Error if the post ID cannot be extracted from a URL
 */
export function extractPostId(input: string): string {
  // If it's a URL, extract the post ID from the path
  if (input.startsWith("http")) {
    const url = new URL(input);
    const pathParts = url.pathname.split("/");
    const postId = pathParts[pathParts.length - 1];
    if (!postId) {
      throw new Error("Could not extract post ID from URL");
    }
    return postId;
  }
  // Otherwise, assume it's already a post ID
  return input;
}
