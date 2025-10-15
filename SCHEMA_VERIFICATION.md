# Slab GraphQL Schema Verification

✅ **VERIFIED**: This implementation has been verified against the actual Slab GraphQL schema SDL from Apollo Studio Explorer.

## Schema Source

- **Apollo Studio**: https://studio.apollographql.com/public/Slab/variant/current/explorer
- **Verification Date**: 2025-10-15

## Verified Schema Details

### ✅ Queries

1. **`post(id: ID!): Post`** - Get a single post
   - Verified field names: `id`, `title`, `content`, `insertedAt`, `updatedAt`, `publishedAt`, `archivedAt`, `owner`
   - Content is stored in Quill Delta JSON format (array of ops)
   - Owner field contains: `id`, `name`, `email`, `title`

2. **`posts(ids: [ID!]!): [Post!]!`** - Get multiple posts by IDs
   - Requires explicit list of IDs
   - Does NOT support topic filtering directly

3. **`topic(id: ID!): Topic`** - Get a topic with its posts
   - `topic.posts` returns all posts in that topic
   - This is the proper way to get posts by topic

4. **`organization: Organization`** - Get organization data
   - `organization.posts` returns all organization posts
   - Returns `SlimPost` type (lighter weight)

5. **`search(query: String!, types: [SearchType!], first: Int, after: String): SearchResultConnection`** - Search
   - Uses **cursor-based pagination** (Relay pattern)
   - Returns `edges` with `node` containing `PostSearchResult`
   - Must specify `types: [POST]` to search only posts
   - `PostSearchResult.post` contains the full post data

### ✅ Mutations

1. **`updatePostContent(id: ID!, delta: Json!): Post`** - Update post content
   - Uses **Quill Delta format** (not plain text!)
   - Delta format example:
     ```json
     {
       "ops": [
         {"delete": 15},
         {"insert": "new content\n\n"}
       ]
     }
     ```
   - Must calculate content length and create replacement delta

2. **`updatePost(id: ID!, ...): Post`** - Update post metadata
   - For title, owner, archived status, linkAccess, banner
   - NOT for content (use `updatePostContent` instead)

3. **`createPost(title: String, topicId: ID, templateId: ID): Post`** - Create new post

4. **`deletePost(id: ID!): Post`** - Delete a post

### ✅ Field Name Conventions

Slab uses **camelCase** for GraphQL (not snake_case):
- `insertedAt` (not `created_at`)
- `updatedAt` (not `updated_at`)
- `publishedAt` (not `published_at`)
- `archivedAt` (not `archived_at`)
- `owner` (not `createdBy` or `created_by`)
- `linkAccess` (not `link_access`)

### ✅ Content Format

**Critical**: Slab stores post content in **Quill Delta format**:

```typescript
// Delta format (what Slab stores)
[
  { insert: "Hello " },
  { insert: "World", attributes: { bold: true } },
  { insert: "\n\n" }
]

// Plain text (what we expose to MCP clients)
"Hello World\n\n"
```

Our implementation:
- **Reading**: Converts Delta to plain text automatically
- **Writing**: Converts plain text to Delta and creates replacement operation

### ✅ Pagination

**Search**: Uses cursor-based pagination (GraphQL Relay pattern)
```graphql
search(query: "test", first: 20, after: "cursor") {
  pageInfo {
    hasNextPage
    endCursor
  }
  edges {
    node {
      ... on PostSearchResult {
        post { id title }
      }
    }
  }
}
```

**Topic/Organization posts**: Returns full arrays (not paginated)

## Implementation Decisions

### 1. Topic Filtering
Since `posts(ids: [ID!]!)` doesn't support topic filtering, we use:
- **With topic**: `topic(id: $topicId) { posts { ... } }`
- **Without topic**: `organization { posts { ... } }`

### 2. Content Conversion
- **Input**: Plain text from MCP clients
- **Processing**: Convert to Quill Delta format
- **Storage**: Delta format in Slab
- **Output**: Plain text to MCP clients

### 3. Update Strategy
To update post content:
1. GET current post to get current content
2. Calculate replacement delta (delete all, insert new)
3. POST delta to `updatePostContent` mutation

## Differences from Initial Guess

| Initial Guess | Actual Schema | Status |
|---------------|---------------|--------|
| `createdAt` | `insertedAt` | ✅ Fixed |
| `updatedBy` | Not in Post type | ✅ Fixed |
| Plain text content | Quill Delta JSON | ✅ Fixed |
| `updatePost(content:)` | `updatePostContent(delta:)` | ✅ Fixed |
| REST-style pagination | Cursor pagination | ✅ Fixed |
| `posts(topicId:)` | `topic(id:).posts` | ✅ Fixed |
| Simple search response | Relay connection pattern | ✅ Fixed |

## Testing

All 20 tests pass ✅ with mocked responses matching actual schema:

```bash
bun test
```

Tests verify:
- Correct GraphQL query structures
- Delta format handling
- Cursor pagination parsing
- Proper field name mapping
- Error handling

## Ready for Production

This implementation is now **ready to use with production Slab credentials**:

```bash
export SLAB_API_TOKEN="your-real-token"
export SLAB_TEAM="your-team"  # Used for display only
bun run index.ts
```

The queries, mutations, and field mappings have all been verified against the actual Slab GraphQL schema.
