import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { Effect, Layer, Context } from "effect";
import type { SlabClientService } from "../src/client.ts";
import { SlabClientServiceLive } from "../src/client.ts";
import type { ConfigService } from "../src/config.ts";

// Mock the global fetch function
const mockFetch = mock();

// Create a test config layer for GraphQL
const TestConfigLayer = Layer.succeed(
  Context.GenericTag<ConfigService>("@services/ConfigService"),
  {
    config: {
      apiToken: "test-token",
      team: "test",
      graphqlUrl: "https://api.slab.com/v1/graphql",
    },
  }
);

describe("SlabClient with GraphQL (Verified Schema)", () => {
  const originalFetch = global.fetch;
  let client: SlabClientService;

  beforeEach(async () => {
    // Replace global fetch with our mock
    global.fetch = mockFetch as any;

    // Build the client with test config
    const program = Effect.gen(function* () {
      return yield* Context.GenericTag<SlabClientService>("@services/SlabClientService");
    });

    client = await Effect.runPromise(
      program.pipe(Effect.provide(SlabClientServiceLive.pipe(Layer.provide(TestConfigLayer))))
    );
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    mockFetch.mockClear();
  });

  describe("getPost", () => {
    test("should fetch a post by ID using GraphQL with actual schema", async () => {
      const mockGraphQLResponse = {
        data: {
          post: {
            id: "123",
            title: "Test Post",
            content: [{ insert: "Test content" }, { insert: "\n\n" }], // Quill Delta format
            insertedAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
            publishedAt: "2024-01-01T00:00:00Z",
            archivedAt: null,
            owner: {
              id: "user1",
              name: "Test User",
              email: "test@example.com",
            },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGraphQLResponse,
      });

      const result = await Effect.runPromise(client.getPost("123"));

      expect(result.id).toBe("123");
      expect(result.title).toBe("Test Post");
      expect(result.content).toBe("Test content\n\n"); // Converted from Delta
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.slab.com/v1/graphql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "token test-token",
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("GetPost"),
        })
      );
    });

    test("should fail on GraphQL errors", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: "Post not found" }],
        }),
      });

      const result = await Effect.runPromise(client.getPost("nonexistent").pipe(Effect.either));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.message).toContain("Post not found");
      }
    });

    test("should fail on HTTP errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });

      const result = await Effect.runPromise(client.getPost("123").pipe(Effect.either));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.message).toContain("403");
      }
    });
  });

  describe("updatePost", () => {
    test("should update a post using Delta format", async () => {
      // First call: get current post
      const mockGetResponse = {
        data: {
          post: {
            id: "123",
            title: "Test Post",
            content: [{ insert: "Old content" }, { insert: "\n\n" }],
            insertedAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
          },
        },
      };

      // Second call: update post content
      const mockUpdateResponse = {
        data: {
          updatePostContent: {
            id: "123",
            title: "Test Post",
            content: [{ insert: "Updated content" }, { insert: "\n\n" }],
            updatedAt: "2024-01-03T00:00:00Z",
          },
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGetResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUpdateResponse,
        });

      const result = await Effect.runPromise(client.updatePost("123", "Updated content"));

      expect(result.content).toBe("Updated content\n\n");
      expect(mockFetch).toHaveBeenCalledTimes(2); // GET then UPDATE

      // Check that the second call uses updatePostContent mutation
      const secondCall = mockFetch.mock.calls[1];
      const body = JSON.parse(secondCall?.[1]?.body);
      expect(body.query).toContain("UpdatePostContent");
      expect(body.variables.delta.ops).toBeDefined();
    });
  });

  describe("searchPosts", () => {
    test("should search posts using cursor pagination", async () => {
      const mockGraphQLResponse = {
        data: {
          search: {
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: "cursor1",
              endCursor: "cursor2",
            },
            edges: [
              {
                cursor: "cursor1",
                node: {
                  title: "Result 1",
                  post: {
                    id: "1",
                    title: "Result 1",
                    content: [{ insert: "Content 1" }, { insert: "\n\n" }],
                    insertedAt: "2024-01-01T00:00:00Z",
                    publishedAt: "2024-01-01T00:00:00Z",
                    owner: {
                      id: "user1",
                      name: "Test User",
                      email: "test@example.com",
                    },
                  },
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGraphQLResponse,
      });

      const result = await Effect.runPromise(client.searchPosts("test query"));

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0]?.title).toBe("Result 1");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.slab.com/v1/graphql",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("SearchPosts"),
        })
      );
    });
  });

  describe("listPosts", () => {
    test("should list all posts from organization when no topic ID provided", async () => {
      const mockGraphQLResponse = {
        data: {
          organization: {
            id: "org1",
            posts: [
              {
                id: "1",
                title: "Post 1",
                content: [{ insert: "Content" }, { insert: "\n\n" }],
                insertedAt: "2024-01-01T00:00:00Z",
                publishedAt: "2024-01-01T00:00:00Z",
                linkAccess: "INTERNAL",
                topics: [{ id: "topic1", name: "General" }],
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGraphQLResponse,
      });

      const result = await Effect.runPromise(client.listPosts());

      expect(result.posts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.slab.com/v1/graphql",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("GetOrganizationPosts"),
        })
      );
    });

    test("should list posts from a specific topic", async () => {
      const mockGraphQLResponse = {
        data: {
          topic: {
            id: "topic-123",
            name: "Engineering",
            posts: [
              {
                id: "1",
                title: "Post 1",
                content: [{ insert: "Content" }, { insert: "\n\n" }],
                insertedAt: "2024-01-01T00:00:00Z",
                publishedAt: "2024-01-01T00:00:00Z",
                linkAccess: "INTERNAL",
                owner: {
                  id: "user1",
                  name: "Test User",
                  email: "test@example.com",
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGraphQLResponse,
      });

      const result = await Effect.runPromise(client.listPosts("topic-123"));

      expect(result.posts).toHaveLength(1);
      const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body);
      expect(body.query).toContain("GetTopicPosts");
      expect(body.variables.topicId).toBe("topic-123");
    });
  });
});
