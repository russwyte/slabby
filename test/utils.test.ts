import { test, expect, describe } from "bun:test";
import { extractPostId } from "../src/utils.ts";

describe("extractPostId", () => {
  test("should extract post ID from full URL", () => {
    const url = "https://myteam.slab.com/posts/abc123";
    const result = extractPostId(url);
    expect(result).toBe("abc123");
  });

  test("should extract post ID from URL with query params", () => {
    const url = "https://myteam.slab.com/posts/xyz789?foo=bar";
    const result = extractPostId(url);
    // URL.pathname strips query params, so we only get the path part
    expect(result).toBe("xyz789");
  });

  test("should return the input if it's already a post ID", () => {
    const postId = "direct-post-id-123";
    const result = extractPostId(postId);
    expect(result).toBe("direct-post-id-123");
  });

  test("should handle URLs with trailing slashes", () => {
    const url = "https://team.slab.com/posts/post-id-456/";
    // Trailing slash results in empty string, which should throw
    expect(() => extractPostId(url)).toThrow("Could not extract post ID from URL");
  });

  test("should throw error for URL without post ID", () => {
    const url = "https://team.slab.com/posts/";
    expect(() => extractPostId(url)).toThrow("Could not extract post ID from URL");
  });

  test("should handle http URLs (not just https)", () => {
    const url = "http://team.slab.com/posts/test-123";
    const result = extractPostId(url);
    expect(result).toBe("test-123");
  });
});
