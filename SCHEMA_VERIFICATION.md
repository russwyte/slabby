# Slab GraphQL Schema Verification Guide

⚠️ **IMPORTANT**: This implementation is based on common GraphQL patterns for CMS/documentation systems. The queries and mutations need to be verified against the actual Slab GraphQL schema before use with production credentials.

## How to Verify

Visit the Slab GraphQL schema documentation:
https://studio.apollographql.com/public/Slab/variant/current/schema/reference

## What to Check

### 1. Query: `GetPost`

**Current Implementation** (`src/graphql.ts:28-48`):
```graphql
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
```

**Verify**:
- [ ] Is the query called `post` or something else (e.g., `getPost`, `Post`)?
- [ ] Is the argument `id` of type `ID!`?
- [ ] Field names: `content` or `body`? `createdAt` or `created_at`?
- [ ] User fields: `displayName` or `display_name` or `name`?
- [ ] Are all these fields available on the Post type?

### 2. Mutation: `UpdatePost`

**Current Implementation** (`src/graphql.ts:54-76`):
```graphql
mutation UpdatePost($id: ID!, $content: String!) {
  updatePost(input: { id: $id, content: $content }) {
    post {
      id
      title
      content
      url
      createdAt
      updatedAt
      # ... user fields
    }
  }
}
```

**Verify**:
- [ ] Is the mutation called `updatePost`?
- [ ] Does it accept an `input` object or direct parameters?
- [ ] What's the structure of the input? `{ id, content }` or different?
- [ ] Does the mutation return `{ post { ... } }` or just the post directly?
- [ ] What's the actual return type?

### 3. Query: `SearchPosts`

**Current Implementation** (`src/graphql.ts:82-103`):
```graphql
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
```

**Verify**:
- [ ] Is there a `search` query?
- [ ] Does it accept a `query` parameter?
- [ ] What does it return? `{ posts, totalCount }` or different structure?
- [ ] Is `snippet` a field in search results?
- [ ] Field naming: `totalCount` vs `total_count`?

### 4. Query: `ListPosts`

**Current Implementation** (`src/graphql.ts:109-135`):
```graphql
query ListPosts($topicId: ID, $limit: Int, $offset: Int) {
  posts(topicId: $topicId, limit: $limit, offset: $offset) {
    items {
      id
      title
      content
      url
      createdAt
      updatedAt
      # ... user fields
    }
    totalCount
  }
}
```

**Verify**:
- [ ] Is there a `posts` query?
- [ ] Does it support `topicId` filtering?
- [ ] Does it support pagination with `limit`/`offset` or uses cursor pagination?
- [ ] Is the response `{ items, totalCount }` or just an array?
- [ ] Alternative structure in `src/graphql.ts:141-158` - which one is correct?

## Common GraphQL Naming Patterns to Check

The code has fallbacks for different naming conventions in `src/client.ts:148-169`:

### Field Name Variations:
- `content` vs `body`
- `createdAt` vs `created_at`
- `updatedAt` vs `updated_at`
- `createdBy` vs `created_by`
- `updatedBy` vs `updated_by`
- `displayName` vs `display_name`
- `totalCount` vs `total_count`

### Response Structure Variations:
- Direct array: `posts: [Post]`
- Paginated: `posts: { items: [Post], totalCount: Int }`
- Connection pattern: `posts: { edges: [{ node: Post }], pageInfo: {...} }`

## Testing After Verification

Once you've updated the queries to match the actual schema:

1. **Update the queries** in `src/graphql.ts`
2. **Run tests**: `bun test` (should still pass with mocked responses)
3. **Test with real credentials**:
   ```bash
   export SLAB_API_TOKEN="your-real-token"
   export SLAB_TEAM="your-team"
   bun run index.ts
   # Then test the MCP server with a real AI coding agent
   ```

## Files to Update

After schema verification, you may need to update:

- [ ] `src/graphql.ts` - Query and mutation definitions
- [ ] `src/client.ts` - Response transformation logic (if field names differ)
- [ ] `src/types.ts` - Type definitions (if structure differs significantly)
- [ ] `test/client.test.ts` - Update mock responses to match real schema

## Authentication

The implementation uses:
```
Authorization: token YOUR_TOKEN
```

Not `Bearer YOUR_TOKEN`. This is based on the example:
```bash
curl -X POST \
  -H "Authorization: token" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { organization { host } }"}' \
https://api.slab.com/v1/graphql
```

Verify this is correct in your testing.

## Need Help?

If you encounter issues during verification:
1. Check the Apollo Studio schema browser
2. Try the example query from Slab docs (if available)
3. Use GraphQL introspection to explore the schema
4. Contact Slab support for API documentation
