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
 * Response formatting functions for MCP tool outputs
 */

import type { SlabPost, SlabSearchResult, SlabListResult } from "./types.ts";

/**
 * Formats a single post response in a readable markdown format
 */
export function formatPostResponse(post: SlabPost): string {
  const title = post.title || "Untitled";
  const content = post.content || "";
  const author = post.created_by?.display_name || "Unknown";
  const updatedAt = post.updated_at ? new Date(post.updated_at).toLocaleString() : "Unknown";
  const url = post.url || "";

  return `# ${title}

**Author:** ${author}
**Last Updated:** ${updatedAt}
**URL:** ${url}

---

${content}`;
}

/**
 * Formats search results in a readable markdown format
 */
export function formatSearchResults(results: SlabSearchResult, query: string): string {
  const posts = results.posts || [];

  if (posts.length === 0) {
    return `No results found for query: "${query}"`;
  }

  let output = `# Search Results for "${query}"\n\nFound ${posts.length} result(s):\n\n`;

  for (const post of posts) {
    const title = post.title || "Untitled";
    const url = post.url || "";
    const snippet = post.snippet || "";
    const author = post.created_by?.display_name || "Unknown";

    output += `## ${title}\n`;
    output += `**Author:** ${author}\n`;
    output += `**URL:** ${url}\n`;
    if (snippet) {
      output += `**Snippet:** ${snippet}\n`;
    }
    output += `\n`;
  }

  return output;
}

/**
 * Formats a list of posts in a readable markdown format
 */
export function formatListResults(results: SlabListResult): string {
  const posts = results.posts || [];

  if (posts.length === 0) {
    return "No posts found.";
  }

  let output = `# Posts\n\nFound ${posts.length} post(s):\n\n`;

  for (const post of posts) {
    const title = post.title || "Untitled";
    const url = post.url || "";
    const author = post.created_by?.display_name || "Unknown";
    const updatedAt = post.updated_at ? new Date(post.updated_at).toLocaleString() : "Unknown";

    output += `## ${title}\n`;
    output += `**Author:** ${author}\n`;
    output += `**Last Updated:** ${updatedAt}\n`;
    output += `**URL:** ${url}\n\n`;
  }

  return output;
}
