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
 * GraphQL queries and mutations for Slab API
 *
 * ⚠️ IMPORTANT: These queries are based on common GraphQL patterns
 * and need to be verified against the actual Slab GraphQL schema at:
 * https://studio.apollographql.com/public/Slab/variant/current/schema/reference
 *
 * Please check and update:
 * - Field names (e.g., is it `content` or `body`? `createdAt` or `created_at`?)
 * - Query/mutation names (e.g., is it `post` or `getPost`?)
 * - Input types and argument names
 * - Return types and nested fields
 */

/**
 * Query to fetch a single post by ID
 *
 * VERIFY: Check actual field names in Apollo Studio schema
 */
export const GET_POST_QUERY = `
  query GetPost($id: ID!) {
    post(id: $id) {
      id
      title
      content
      url
      createdAt
      updatedAt
      createdBy {
        id
        displayName
        email
      }
      updatedBy {
        id
        displayName
        email
      }
    }
  }
`;

/**
 * Mutation to update a post's content
 *
 * VERIFY: Check if the mutation is called updatePost and if input structure is correct
 */
export const UPDATE_POST_MUTATION = `
  mutation UpdatePost($id: ID!, $content: String!) {
    updatePost(input: { id: $id, content: $content }) {
      post {
        id
        title
        content
        url
        createdAt
        updatedAt
        createdBy {
          id
          displayName
          email
        }
        updatedBy {
          id
          displayName
          email
        }
      }
    }
  }
`;

/**
 * Query to search for posts
 *
 * VERIFY: Check if search query exists and what fields it accepts/returns
 */
export const SEARCH_POSTS_QUERY = `
  query SearchPosts($query: String!) {
    search(query: $query) {
      posts {
        id
        title
        content
        url
        snippet
        createdAt
        updatedAt
        createdBy {
          id
          displayName
          email
        }
      }
      totalCount
    }
  }
`;

/**
 * Query to list posts, optionally filtered by topic
 *
 * VERIFY: Check if posts query exists and supports topic filtering
 */
export const LIST_POSTS_QUERY = `
  query ListPosts($topicId: ID, $limit: Int, $offset: Int) {
    posts(topicId: $topicId, limit: $limit, offset: $offset) {
      items {
        id
        title
        content
        url
        createdAt
        updatedAt
        createdBy {
          id
          displayName
          email
        }
        updatedBy {
          id
          displayName
          email
        }
      }
      totalCount
    }
  }
`;

/**
 * Alternative LIST_POSTS_QUERY if the schema uses different structure
 *
 * VERIFY: Check which pattern Slab uses
 */
export const LIST_POSTS_QUERY_ALT = `
  query ListPosts($topicId: ID) {
    posts(filter: { topicId: $topicId }) {
      id
      title
      content
      url
      createdAt
      updatedAt
      createdBy {
        id
        displayName
        email
      }
      updatedBy {
        id
        displayName
        email
      }
    }
  }
`;
