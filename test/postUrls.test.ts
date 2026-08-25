/**
 * Tests for slug-aware post ids, team-based urls, and search snippets:
 * - slug-aware post id extraction from Slab URLs
 * - post urls built from the configured team subdomain
 * - search highlight surfaced as snippet
 */

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { Effect, Layer, Context } from "effect";
import { extractPostId } from "../src/utils.ts";
import type { SlabClientService } from "../src/client.ts";
import { SlabClientServiceLive } from "../src/client.ts";
import type { ConfigService } from "../src/config.ts";

describe("extractPostId slug handling", () => {
  test("extracts trailing id from a slugged Slab URL", async () => {
    const url = "https://numeric.slab.com/posts/principles-expectations-for-engineers-0d9vtl28";
    const result = await Effect.runPromise(extractPostId(url));
    expect(result).toBe("0d9vtl28");
  });

  test("keeps a slugless URL segment as-is", async () => {
    const url = "https://numeric.slab.com/posts/0d9vtl28";
    const result = await Effect.runPromise(extractPostId(url));
    expect(result).toBe("0d9vtl28");
  });

  test("does not treat a short hyphenated tail as an id", async () => {
    const url = "http://team.slab.com/posts/test-123";
    const result = await Effect.runPromise(extractPostId(url));
    expect(result).toBe("test-123");
  });

  test("leaves direct ids untouched", async () => {
    const result = await Effect.runPromise(extractPostId("0d9vtl28"));
    expect(result).toBe("0d9vtl28");
  });
});

describe("team-based urls and search snippets", () => {
  const mockFetch = mock();
  const originalFetch = global.fetch;
  let client: SlabClientService;

  const TestConfigLayer = Layer.succeed(
    Context.GenericTag<ConfigService>("@services/ConfigService"),
    {
      config: {
        apiToken: "test-token",
        team: "numeric",
        graphqlUrl: "https://api.slab.com/v1/graphql",
      },
    }
  );

  beforeEach(async () => {
    global.fetch = mockFetch as any;
    const program = Effect.gen(function* () {
      return yield* Context.GenericTag<SlabClientService>("@services/SlabClientService");
    });
    client = await Effect.runPromise(
      program.pipe(Effect.provide(SlabClientServiceLive.pipe(Layer.provide(TestConfigLayer))))
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFetch.mockClear();
  });

  test("getPost builds the url from the team subdomain", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          post: {
            id: "0d9vtl28",
            title: "Principles",
            content: [{ insert: "Hello\n" }],
            insertedAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
          },
        },
      }),
    });

    const result = await Effect.runPromise(client.getPost("0d9vtl28"));
    expect(result.url).toBe("https://numeric.slab.com/posts/0d9vtl28");
  });

  test("searchPosts surfaces the highlight as snippet", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          search: {
            pageInfo: { hasNextPage: false, hasPreviousPage: false },
            edges: [
              {
                cursor: "c1",
                node: {
                  title: "Result 1",
                  highlight: "matched <b>principles</b> text",
                  post: {
                    id: "1",
                    title: "Result 1",
                    content: [{ insert: "Content 1\n" }],
                    insertedAt: "2024-01-01T00:00:00Z",
                  },
                },
              },
            ],
          },
        },
      }),
    });

    const result = await Effect.runPromise(client.searchPosts("principles"));
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.snippet).toBe("matched <b>principles</b> text");
    expect(result.posts[0]?.url).toBe("https://numeric.slab.com/posts/1");
  });
});
