import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { Effect, Layer, Context } from "effect";
import type { SlabClientService } from "../src/client.ts";
import { SlabClientServiceLive } from "../src/client.ts";
import type { ConfigService } from "../src/config.ts";

// Mock the global fetch function
const mockFetch = mock();

// Create a test config layer
const TestConfigLayer = Layer.succeed(
  Context.GenericTag<ConfigService>("@services/ConfigService"),
  {
    config: {
      apiToken: "test-token",
      team: "test",
      baseUrl: "https://test.slab.com/api/v1",
    },
  }
);

describe("SlabClient with Effect", () => {
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
    test("should fetch a post by ID", async () => {
      const mockPost = {
        id: "123",
        title: "Test Post",
        content: "Test content",
        url: "https://test.slab.com/posts/123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockPost,
      });

      const result = await Effect.runPromise(client.getPost("123"));

      expect(result).toEqual(mockPost);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.slab.com/api/v1/posts/123",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
        })
      );
    });

    test("should fail on failed request", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      const result = await Effect.runPromise(client.getPost("nonexistent").pipe(Effect.either));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.message).toContain("Slab API error (404): Not Found");
      }
    });
  });

  describe("updatePost", () => {
    test("should update a post with new content", async () => {
      const mockUpdatedPost = {
        id: "123",
        title: "Test Post",
        content: "Updated content",
        url: "https://test.slab.com/posts/123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockUpdatedPost,
      });

      const result = await Effect.runPromise(client.updatePost("123", "Updated content"));

      expect(result).toEqual(mockUpdatedPost);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.slab.com/api/v1/posts/123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ content: "Updated content" }),
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
        })
      );
    });
  });

  describe("searchPosts", () => {
    test("should search posts with a query", async () => {
      const mockSearchResults = {
        posts: [
          {
            id: "1",
            title: "Result 1",
            content: "Content",
            url: "https://test.slab.com/posts/1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSearchResults,
      });

      const result = await Effect.runPromise(client.searchPosts("test query"));

      expect(result).toEqual(mockSearchResults);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/search?query=test+query"),
        expect.any(Object)
      );
    });
  });

  describe("listPosts", () => {
    test("should list all posts when no topic ID is provided", async () => {
      const mockPosts = {
        posts: [
          {
            id: "1",
            title: "Post 1",
            content: "Content",
            url: "https://test.slab.com/posts/1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockPosts,
      });

      const result = await Effect.runPromise(client.listPosts());

      expect(result).toEqual(mockPosts);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.slab.com/api/v1/posts",
        expect.any(Object)
      );
    });

    test("should list posts filtered by topic ID", async () => {
      const mockPosts = {
        posts: [
          {
            id: "1",
            title: "Post 1",
            content: "Content",
            url: "https://test.slab.com/posts/1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockPosts,
      });

      const result = await Effect.runPromise(client.listPosts("topic-123"));

      expect(result).toEqual(mockPosts);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.slab.com/api/v1/posts?topic_id=topic-123",
        expect.any(Object)
      );
    });
  });
});
