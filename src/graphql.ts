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
 * ✅ VERIFIED against actual Slab GraphQL schema SDL from:
 * https://studio.apollographql.com/public/Slab/variant/current/explorer
 */

/**
 * Query to fetch a single post by ID
 *
 * Uses actual Slab schema fields:
 * - insertedAt (not createdAt)
 * - publishedAt, archivedAt
 * - content is in Delta/JSON format
 * - owner (not createdBy)
 */
export const GET_POST_QUERY = `
  query GetPost($id: ID!) {
    post(id: $id) {
      id
      title
      content
      linkAccess
      insertedAt
      updatedAt
      publishedAt
      archivedAt
      version
      owner {
        id
        name
        email
        title
        deactivatedAt
      }
    }
  }
`;

/**
 * Mutation to update a post's content using Delta format
 *
 * Slab uses Quill Delta format for content updates.
 *
 * Delta format example:
 * { "ops": [{"delete": N}, {"insert": "new content\n\n"}] }
 *
 * IMPORTANT: the `delta` variable must be passed as a JSON-encoded STRING
 * (e.g. JSON.stringify({ops: [...]})), mirroring how the API returns post
 * content. Passing a raw object fails Absinthe input validation with
 * `Argument "delta" has invalid value $delta. In field "ops": Unknown field.`
 *
 * ALSO IMPORTANT: this mutation writes to the post's unpublished draft.
 * `post.content` reflects the published revision, so the change is invisible
 * until the post is re-published (see PUBLISH_POST_MUTATION).
 */
export const UPDATE_POST_CONTENT_MUTATION = `
  mutation UpdatePostContent($id: ID!, $delta: Json!) {
    updatePostContent(id: $id, delta: $delta) {
      id
      title
      content
      updatedAt
      version
    }
  }
`;

/**
 * Mutation to set a post's published state.
 *
 * updatePostContent edits land in the post's draft; post.content returns the
 * published revision. Publishing promotes the draft — but ONLY on the
 * false→true transition: `updatePost(published: true)` on an already-published
 * post is a no-op (verified empirically). To promote a draft on a published
 * post, unpublish then republish. Note this also publishes any pre-existing
 * unpublished edits on the post.
 */
export const SET_POST_PUBLISHED_MUTATION = `
  mutation SetPostPublished($id: ID!, $published: Boolean) {
    updatePost(id: $id, published: $published) {
      id
      title
      content
      linkAccess
      insertedAt
      updatedAt
      publishedAt
      archivedAt
      version
      owner {
        id
        name
        email
        title
        deactivatedAt
      }
    }
  }
`;

/**
 * Minimal create/delete mutations used to discover the token user's identity:
 * the API has no viewer query, but the owner of a post we create is by
 * definition the token's user. The probe post is deleted immediately.
 */
export const CREATE_PROBE_POST_MUTATION = `
  mutation CreateProbePost($title: String) {
    createPost(title: $title) {
      id
      owner {
        id
      }
    }
  }
`;

export const DELETE_POST_MUTATION = `
  mutation DeletePost($id: ID!) {
    deletePost(id: $id) {
      id
    }
  }
`;

/**
 * Query to search for posts using cursor-based pagination
 *
 * Slab search follows GraphQL Relay cursor pagination pattern
 */
export const SEARCH_POSTS_QUERY = `
  query SearchPosts($query: String!, $first: Int, $after: String) {
    search(query: $query, types: [POST], first: $first, after: $after) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          ... on PostSearchResult {
            title
            highlight
            post {
              id
              title
              content
              insertedAt
              publishedAt
              owner {
                id
                name
                email
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Query to get posts by IDs
 *
 * NOTE: Slab's posts query requires specific IDs, it doesn't support
 * topic filtering directly. To get posts by topic, you need to:
 * 1. Query the topic to get its posts
 * 2. Or use search with appropriate filters
 */
export const GET_POSTS_BY_IDS_QUERY = `
  query GetPostsByIds($ids: [ID!]!) {
    posts(ids: $ids) {
      id
      title
      content
      insertedAt
      publishedAt
      linkAccess
      owner {
        id
        name
        email
      }
      topics {
        id
        name
      }
    }
  }
`;

/**
 * Query to get a topic's posts
 *
 * This is the proper way to list posts in a topic according to Slab schema
 */
export const GET_TOPIC_POSTS_QUERY = `
  query GetTopicPosts($topicId: ID!) {
    topic(id: $topicId) {
      id
      name
      posts {
        id
        title
        content
        insertedAt
        publishedAt
        linkAccess
        owner {
          id
          name
          email
        }
      }
    }
  }
`;

/**
 * Query to get organization's all posts (if no topic filter needed)
 */
export const GET_ORGANIZATION_POSTS_QUERY = `
  query GetOrganizationPosts {
    organization {
      id
      posts {
        id
        title
        publishedAt
        linkAccess
        topics {
          id
        }
      }
    }
  }
`;
