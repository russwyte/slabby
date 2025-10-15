import { test, expect, describe } from "bun:test";
import { formatPostResponse, formatSearchResults, formatListResults } from "../src/formatters.ts";
import type { SlabPost, SlabSearchResult, SlabListResult } from "../src/types.ts";

describe("formatPostResponse", () => {
  test("should format a complete post correctly", () => {
    const post: SlabPost = {
      id: "123",
      title: "Test Post",
      content: "This is the post content.",
      url: "https://team.slab.com/posts/123",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      created_by: {
        id: "user1",
        display_name: "John Doe",
      },
    };

    const result = formatPostResponse(post);

    expect(result).toContain("# Test Post");
    expect(result).toContain("**Author:** John Doe");
    expect(result).toContain("**URL:** https://team.slab.com/posts/123");
    expect(result).toContain("This is the post content.");
  });

  test("should handle post without author", () => {
    const post: SlabPost = {
      id: "123",
      title: "Test Post",
      content: "Content",
      url: "https://team.slab.com/posts/123",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const result = formatPostResponse(post);
    expect(result).toContain("**Author:** Unknown");
  });

  test("should handle empty title", () => {
    const post: SlabPost = {
      id: "123",
      title: "",
      content: "Content",
      url: "https://team.slab.com/posts/123",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const result = formatPostResponse(post);
    expect(result).toContain("# Untitled");
  });
});

describe("formatSearchResults", () => {
  test("should format multiple search results", () => {
    const results: SlabSearchResult = {
      posts: [
        {
          id: "1",
          title: "First Post",
          content: "Content 1",
          url: "https://team.slab.com/posts/1",
          snippet: "This is a snippet...",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          created_by: {
            id: "user1",
            display_name: "Alice",
          },
        },
        {
          id: "2",
          title: "Second Post",
          content: "Content 2",
          url: "https://team.slab.com/posts/2",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          created_by: {
            id: "user2",
            display_name: "Bob",
          },
        },
      ],
    };

    const result = formatSearchResults(results, "test query");

    expect(result).toContain('Search Results for "test query"');
    expect(result).toContain("Found 2 result(s)");
    expect(result).toContain("## First Post");
    expect(result).toContain("## Second Post");
    expect(result).toContain("**Author:** Alice");
    expect(result).toContain("**Author:** Bob");
    expect(result).toContain("**Snippet:** This is a snippet...");
  });

  test("should handle empty search results", () => {
    const results: SlabSearchResult = {
      posts: [],
    };

    const result = formatSearchResults(results, "no matches");
    expect(result).toBe('No results found for query: "no matches"');
  });
});

describe("formatListResults", () => {
  test("should format a list of posts", () => {
    const results: SlabListResult = {
      posts: [
        {
          id: "1",
          title: "Post One",
          content: "Content",
          url: "https://team.slab.com/posts/1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          created_by: {
            id: "user1",
            display_name: "Charlie",
          },
        },
      ],
    };

    const result = formatListResults(results);

    expect(result).toContain("# Posts");
    expect(result).toContain("Found 1 post(s)");
    expect(result).toContain("## Post One");
    expect(result).toContain("**Author:** Charlie");
  });

  test("should handle empty list", () => {
    const results: SlabListResult = {
      posts: [],
    };

    const result = formatListResults(results);
    expect(result).toBe("No posts found.");
  });
});
