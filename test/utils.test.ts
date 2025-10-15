import { test, expect, describe } from "bun:test";
import { Effect } from "effect";
import { extractPostId } from "../src/utils.ts";

describe("extractPostId", () => {
  test("should extract post ID from full URL", async () => {
    const url = "https://myteam.slab.com/posts/abc123";
    const result = await Effect.runPromise(extractPostId(url));
    expect(result).toBe("abc123");
  });

  test("should extract post ID from URL with query params", async () => {
    const url = "https://myteam.slab.com/posts/xyz789?foo=bar";
    const result = await Effect.runPromise(extractPostId(url));
    // URL.pathname strips query params, so we only get the path part
    expect(result).toBe("xyz789");
  });

  test("should return the input if it's already a post ID", async () => {
    const postId = "direct-post-id-123";
    const result = await Effect.runPromise(extractPostId(postId));
    expect(result).toBe("direct-post-id-123");
  });

  test("should handle URLs with trailing slashes", async () => {
    const url = "https://team.slab.com/posts/post-id-456/";
    // Trailing slash results in empty string, which should fail
    const result = await Effect.runPromise(extractPostId(url).pipe(Effect.either));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Could not extract post ID from URL");
    }
  });

  test("should fail for URL without post ID", async () => {
    const url = "https://team.slab.com/posts/";
    const result = await Effect.runPromise(extractPostId(url).pipe(Effect.either));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Could not extract post ID from URL");
    }
  });

  test("should handle http URLs (not just https)", async () => {
    const url = "http://team.slab.com/posts/test-123";
    const result = await Effect.runPromise(extractPostId(url));
    expect(result).toBe("test-123");
  });
});
