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
 * Slab API client
 */

import type { SlabPost, SlabSearchResult, SlabListResult, SlabConfig } from "./types.ts";

export class SlabClient {
  private token: string;
  private baseUrl: string;

  constructor(config: SlabConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl;
  }

  /**
   * Makes an authenticated request to the Slab API
   */
  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slab API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetches a Slab post by ID
   */
  async getPost(postId: string): Promise<SlabPost> {
    return this.request(`/posts/${postId}`);
  }

  /**
   * Updates a Slab post with new content
   */
  async updatePost(postId: string, content: string): Promise<SlabPost> {
    return this.request(`/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  }

  /**
   * Searches for posts matching a query
   */
  async searchPosts(query: string): Promise<SlabSearchResult> {
    const params = new URLSearchParams({ query });
    return this.request(`/search?${params}`);
  }

  /**
   * Lists posts, optionally filtered by topic ID
   */
  async listPosts(topicId?: string): Promise<SlabListResult> {
    const params = topicId ? `?topic_id=${topicId}` : "";
    return this.request(`/posts${params}`);
  }
}
