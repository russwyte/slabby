import { test, expect, describe } from "bun:test";
import { Effect } from "effect";
import { deltaToMarkdown, contentToMarkdown, DeltaConversionError } from "../src/deltaToMarkdown.ts";

describe("deltaToMarkdown", () => {
  test("should convert simple text delta to markdown", async () => {
    const delta = [{ insert: "Hello world" }, { insert: "\n\n" }];
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).toContain("Hello world");
  });

  test("should convert bold text", async () => {
    const delta = [
      { insert: "Hello " },
      { insert: "bold", attributes: { bold: true } },
      { insert: "\n\n" },
    ];
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).toContain("**bold**");
  });

  test("should convert italic text", async () => {
    const delta = [
      { insert: "Hello " },
      { insert: "italic", attributes: { italic: true } },
      { insert: "\n\n" },
    ];
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).toContain("_italic_");
  });

  test("should convert headings", async () => {
    const delta = [
      { insert: "My Heading" },
      { insert: "\n", attributes: { header: 1 } },
    ];
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).toContain("# My Heading");
  });

  test("should convert links", async () => {
    const delta = [
      { insert: "Click here", attributes: { link: "https://example.com" } },
      { insert: "\n\n" },
    ];
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).toContain("[Click here](https://example.com)");
  });

  test("should return empty string for empty delta", async () => {
    const result = await Effect.runPromise(deltaToMarkdown([]));
    expect(result).toBe("");
  });

  test("should return empty string for null/undefined delta", async () => {
    const result = await Effect.runPromise(deltaToMarkdown(null));
    expect(result).toBe("");
  });

  test("should handle delta with ops wrapper", async () => {
    const delta = { ops: [{ insert: "Wrapped content" }, { insert: "\n\n" }] };
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).toContain("Wrapped content");
  });

  test("should trim trailing whitespace", async () => {
    const delta = [{ insert: "Content" }, { insert: "\n\n" }];
    const result = await Effect.runPromise(deltaToMarkdown(delta));
    expect(result).not.toMatch(/\s+$/);
  });
});

describe("contentToMarkdown", () => {
  test("should pass through plain strings trimmed", async () => {
    const result = await Effect.runPromise(contentToMarkdown("  hello  "));
    expect(result).toBe("hello");
  });

  test("should return empty string for empty string input", async () => {
    const result = await Effect.runPromise(contentToMarkdown(""));
    expect(result).toBe("");
  });

  test("should convert delta arrays", async () => {
    const delta = [{ insert: "Delta content" }, { insert: "\n\n" }];
    const result = await Effect.runPromise(contentToMarkdown(delta));
    expect(result).toContain("Delta content");
  });

  test("should convert delta wrapper objects", async () => {
    const delta = { ops: [{ insert: "Wrapped" }, { insert: "\n\n" }] };
    const result = await Effect.runPromise(contentToMarkdown(delta));
    expect(result).toContain("Wrapped");
  });

  test("should decode JSON-encoded delta strings (Slab API shape)", async () => {
    const content = JSON.stringify([
      { attributes: { author: "abc" }, insert: "Heading" },
      { attributes: { header: 1 }, insert: "\n" },
      { insert: "Body text\n" },
    ]);
    const result = await Effect.runPromise(contentToMarkdown(content));
    expect(result).toContain("# Heading");
    expect(result).toContain("Body text");
    expect(result).not.toContain('"insert"');
  });

  test("should decode JSON-encoded delta wrapper strings", async () => {
    const content = JSON.stringify({ ops: [{ insert: "Wrapped string\n" }] });
    const result = await Effect.runPromise(contentToMarkdown(content));
    expect(result).toContain("Wrapped string");
    expect(result).not.toContain('"ops"');
  });

  test("should return empty string for null", async () => {
    const result = await Effect.runPromise(contentToMarkdown(null));
    expect(result).toBe("");
  });

  test("should return empty string for undefined", async () => {
    const result = await Effect.runPromise(contentToMarkdown(undefined));
    expect(result).toBe("");
  });

  test("should return empty string for number", async () => {
    const result = await Effect.runPromise(contentToMarkdown(42));
    expect(result).toBe("");
  });

  test("should return empty string for object without ops", async () => {
    const result = await Effect.runPromise(contentToMarkdown({ foo: "bar" }));
    expect(result).toBe("");
  });
});

describe("DeltaConversionError", () => {
  test("should have correct _tag", () => {
    const error = new DeltaConversionError({ message: "test error" });
    expect(error._tag).toBe("DeltaConversionError");
    expect(error.message).toBe("test error");
  });

  test("should preserve cause", () => {
    const cause = new Error("root cause");
    const error = new DeltaConversionError({ message: "wrapper", cause });
    expect(error.cause).toBe(cause);
  });
});
