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

describe("SlabClient with GraphQL", () => {
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
    test("should fetch a post by ID using GraphQL", async () => {
      const mockGraphQLResponse = {
        data: {
          post: {
            id: "123",
            title: "Test Post",
            content: "Test content",
            url: "https://test.slab.com/posts/123",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
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
    test("should update a post with new content using GraphQL", async () => {
      const mockGraphQLResponse = {
        data: {
          updatePost: {
            post: {
              id: "123",
              title: "Test Post",
              content: "Updated content",
              url: "https://test.slab.com/posts/123",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-03T00:00:00Z",
            },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGraphQLResponse,
      });

      const result = await Effect.runPromise(client.updatePost("123", "Updated content"));

      expect(result.content).toBe("Updated content");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.slab.com/v1/graphql",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("UpdatePost"),
        })
      );
    });
  });

  describe("searchPosts", () => {
    test("should search posts with a query using GraphQL", async () => {
      const mockGraphQLResponse = {
        data: {
          search: {
            posts: [
              {
                id: "1",
                title: "Result 1",
                content: "Content",
                url: "https://test.slab.com/posts/1",
                createdAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-02T00:00:00Z",
              },
            ],
            totalCount: 1,
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
    test("should list all posts when no topic ID is provided using GraphQL", async () => {
      const mockGraphQLResponse = {
        data: {
          posts: {
            items: [
              {
                id: "1",
                title: "Post 1",
                content: "Content",
                url: "https://test.slab.com/posts/1",
                createdAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-02T00:00:00Z",
              },
            ],
            totalCount: 1,
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
        })
      );
    });

    test("should list posts filtered by topic ID using GraphQL", async () => {
      const mockGraphQLResponse = {
        data: {
          posts: {
            items: [
              {
                id: "1",
                title: "Post 1",
                content: "Content",
                url: "https://test.slab.com/posts/1",
                createdAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-02T00:00:00Z",
              },
            ],
            totalCount: 1,
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
      expect(body.variables.topicId).toBe("topic-123");
    });
  });
});
