import { describe, test, expect } from "bun:test";
import { Effect } from "effect";
import {
  markdownToOps,
  parseInline,
  deltaLength,
  endsWithNewline,
} from "../src/markdownToDelta.ts";
import { deltaToMarkdown } from "../src/deltaToMarkdown.ts";

describe("parseInline", () => {
  test("plain text", () => {
    expect(parseInline("hello world")).toEqual([{ insert: "hello world" }]);
  });

  test("bold", () => {
    expect(parseInline("a **bold** word")).toEqual([
      { insert: "a " },
      { insert: "bold", attributes: { bold: true } },
      { insert: " word" },
    ]);
  });

  test("italic with underscores and asterisks", () => {
    expect(parseInline("_it_ and *that*")).toEqual([
      { insert: "it", attributes: { italic: true } },
      { insert: " and " },
      { insert: "that", attributes: { italic: true } },
    ]);
  });

  test("strikethrough", () => {
    expect(parseInline("~~gone~~")).toEqual([
      { insert: "gone", attributes: { strike: true } },
    ]);
  });

  test("inline code keeps content verbatim (no unescaping)", () => {
    expect(parseInline("run `pnpm install --a_b*`")).toEqual([
      { insert: "run " },
      { insert: "pnpm install --a_b*", attributes: { code: true } },
    ]);
  });

  test("link", () => {
    expect(parseInline("[Docker](https://docker.com)")).toEqual([
      { insert: "Docker", attributes: { link: "https://docker.com" } },
    ]);
  });

  test("bold link nests attributes", () => {
    expect(parseInline("**[Docs](https://x.io)**")).toEqual([
      { insert: "Docs", attributes: { bold: true, link: "https://x.io" } },
    ]);
  });

  test("escaped markers stay literal", () => {
    expect(parseInline("not \\*bold\\*")).toEqual([{ insert: "not *bold*" }]);
  });

  test("underscores inside words are not italic", () => {
    // snake_case identifiers: single _ pairs would wrongly match, so make
    // sure common code-ish text survives when it is backtick-quoted
    expect(parseInline("`core_lines` schema")).toEqual([
      { insert: "core_lines", attributes: { code: true } },
      { insert: " schema" },
    ]);
  });

  test("snake_case identifiers outside code are preserved verbatim", () => {
    expect(parseInline("use my_variable_name and ENV_VAR_NAME here")).toEqual([
      { insert: "use my_variable_name and ENV_VAR_NAME here" },
    ]);
  });

  test("intra-word double underscores are preserved (dunder names)", () => {
    expect(parseInline("call foo__bar__baz now")).toEqual([
      { insert: "call foo__bar__baz now" },
    ]);
  });

  test("boundary underscores still italicize", () => {
    expect(parseInline("an _italic_ word")).toEqual([
      { insert: "an " },
      { insert: "italic", attributes: { italic: true } },
      { insert: " word" },
    ]);
  });

  test("bold italic with triple asterisks", () => {
    expect(parseInline("***both***")).toEqual([
      { insert: "both", attributes: { bold: true, italic: true } },
    ]);
  });

  test("mid-line image degrades to a link, never a block embed", () => {
    expect(parseInline("before ![alt text](https://x.io/a.png) after")).toEqual([
      { insert: "before " },
      { insert: "alt text", attributes: { link: "https://x.io/a.png" } },
      { insert: " after" },
    ]);
  });

  test("link URLs with balanced parentheses survive", () => {
    expect(parseInline("[wiki](https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      { insert: "wiki", attributes: { link: "https://en.wikipedia.org/wiki/Foo_(bar)" } },
    ]);
  });

  test("double-backtick code spans containing backticks", () => {
    expect(parseInline("run `` a`b `` now")).toEqual([
      { insert: "run " },
      { insert: "a`b", attributes: { code: true } },
      { insert: " now" },
    ]);
  });
});

describe("markdownToOps", () => {
  test("header levels clamp to 3", () => {
    const ops = markdownToOps("# One\n#### Four");
    expect(ops).toEqual([
      { insert: "One" },
      { insert: "\n", attributes: { header: 1 } },
      { insert: "Four" },
      { insert: "\n", attributes: { header: 3 } },
    ]);
  });

  test("bullet, ordered, and task lists", () => {
    const ops = markdownToOps("- a\n1. b\n- [ ] c\n- [x] d");
    expect(ops).toEqual([
      { insert: "a" },
      { insert: "\n", attributes: { list: "bullet" } },
      { insert: "b" },
      { insert: "\n", attributes: { list: "ordered" } },
      { insert: "c" },
      { insert: "\n", attributes: { list: "unchecked" } },
      { insert: "d" },
      { insert: "\n", attributes: { list: "checked" } },
    ]);
  });

  test("nested lists with 2-space indents", () => {
    const ops = markdownToOps("- a\n  - b\n    - c\n  - d\n- e");
    const lineAttrs = ops.filter((o) => o.insert === "\n").map((o) => o.attributes);
    expect(lineAttrs).toEqual([
      { list: "bullet" },
      { list: "bullet", indent: 1 },
      { list: "bullet", indent: 2 },
      { list: "bullet", indent: 1 },
      { list: "bullet" },
    ]);
  });

  test("nested lists with 4-space indents (turndown style)", () => {
    const ops = markdownToOps("- a\n    - b\n        - c");
    const lineAttrs = ops.filter((o) => o.insert === "\n").map((o) => o.attributes);
    expect(lineAttrs).toEqual([
      { list: "bullet" },
      { list: "bullet", indent: 1 },
      { list: "bullet", indent: 2 },
    ]);
  });

  test("fenced code block becomes Slab code-embed", () => {
    const ops = markdownToOps("```bash\necho hi\n```");
    expect(ops).toEqual([
      {
        insert: { "code-embed": [{ insert: "echo hi\n" }] },
        attributes: { language: "bash" },
      },
    ]);
  });

  test("code block without language has no attributes", () => {
    const ops = markdownToOps("```\nx\n```");
    expect(ops).toEqual([{ insert: { "code-embed": [{ insert: "x\n" }] } }]);
  });

  test("code block content is never inline-parsed", () => {
    const ops = markdownToOps("```\n**not bold** `raw` [x](y)\n```");
    expect(ops).toEqual([
      { insert: { "code-embed": [{ insert: "**not bold** `raw` [x](y)\n" }] } },
    ]);
  });

  test("horizontal rule becomes hr embed", () => {
    expect(markdownToOps("---")).toEqual([{ insert: { hr: true } }]);
  });

  test("standalone image becomes Slab image embed", () => {
    expect(markdownToOps("![alt](https://img.test/a.png)")).toEqual([
      { insert: { image: [{ source: "https://img.test/a.png" }] } },
    ]);
  });

  test("blockquote", () => {
    expect(markdownToOps("> hello")).toEqual([
      { insert: "hello" },
      { insert: "\n", attributes: { blockquote: true } },
    ]);
  });

  test("blank lines separate paragraphs without empty inserts", () => {
    expect(markdownToOps("a\n\nb")).toEqual([
      { insert: "a" },
      { insert: "\n" },
      { insert: "b" },
      { insert: "\n" },
    ]);
  });

  test("empty markdown yields a single newline", () => {
    expect(markdownToOps("")).toEqual([{ insert: "\n" }]);
  });

  test("crlf input is normalized", () => {
    expect(markdownToOps("a\r\nb")).toEqual([
      { insert: "a" },
      { insert: "\n" },
      { insert: "b" },
      { insert: "\n" },
    ]);
  });

  test("fence info strings with special characters do not swallow the document", () => {
    const ops = markdownToOps("```c#\nvar x = 1;\n```\nafter paragraph");
    expect(ops).toEqual([
      { insert: { "code-embed": [{ insert: "var x = 1;\n" }] }, attributes: { language: "c#" } },
      { insert: "after paragraph" },
      { insert: "\n" },
    ]);
  });

  test("multi-word fence info string takes first token as language", () => {
    const ops = markdownToOps('```python title="demo.py"\nprint(1)\n```');
    expect(ops).toEqual([
      { insert: { "code-embed": [{ insert: "print(1)\n" }] }, attributes: { language: "python" } },
    ]);
  });

  test("horizontal rule immediately after a list is an hr embed", () => {
    const ops = markdownToOps("- item\n---");
    expect(ops).toEqual([
      { insert: "item" },
      { insert: "\n", attributes: { list: "bullet" } },
      { insert: { hr: true } },
    ]);
  });

  test("setext headers", () => {
    expect(markdownToOps("Title\n===")).toEqual([
      { insert: "Title" },
      { insert: "\n", attributes: { header: 1 } },
    ]);
    expect(markdownToOps("Sub\n---")).toEqual([
      { insert: "Sub" },
      { insert: "\n", attributes: { header: 2 } },
    ]);
    // --- after a blank line is a plain hr, not setext
    expect(markdownToOps("para\n\n---")).toEqual([
      { insert: "para" },
      { insert: "\n" },
      { insert: { hr: true } },
    ]);
  });

  test("single-space list indent is not nesting", () => {
    const ops = markdownToOps("- a\n - b");
    const lineAttrs = ops.filter((o) => o.insert === "\n").map((o) => o.attributes);
    expect(lineAttrs).toEqual([{ list: "bullet" }, { list: "bullet" }]);
  });
});

describe("deltaLength / endsWithNewline", () => {
  test("counts UTF-16 units for text and 1 per embed", () => {
    expect(
      deltaLength([
        { insert: "ab" },
        { insert: { hr: true } },
        { insert: "c\n" },
      ])
    ).toBe(5);
  });

  test("astral characters count as 2 (UTF-16), like the JS Quill reference", () => {
    expect(deltaLength([{ insert: "🎉" }])).toBe(2);
  });

  test("endsWithNewline detects line termination", () => {
    expect(endsWithNewline([{ insert: "a\n" }])).toBe(true);
    expect(endsWithNewline([{ insert: "a" }])).toBe(false);
    // Block embeds occupy their own line, so no separator newline is needed
    expect(endsWithNewline([{ insert: "a\n" }, { insert: { hr: true } }])).toBe(true);
    expect(endsWithNewline([{ insert: "a\n" }, { insert: { "code-embed": [] } }])).toBe(true);
    // Inline embeds (mentions) do not terminate the line
    expect(endsWithNewline([{ insert: "a\n" }, { insert: { mention: { id: "x" } } }])).toBe(false);
    expect(endsWithNewline([])).toBe(true);
  });
});

describe("checklist round-trip", () => {
  test("checked/unchecked list state survives read-back", async () => {
    const ops = markdownToOps("- [ ] open task\n- [x] done task");
    const back = await Effect.runPromise(deltaToMarkdown(ops));
    expect(back).toContain("- [ ] open task");
    expect(back).toContain("- [x] done task");
  });

  test("consecutive paragraphs read back as paragraphs, not hard breaks", async () => {
    const ops = markdownToOps("first para\n\nsecond para");
    const back = await Effect.runPromise(deltaToMarkdown(ops));
    expect(back).toMatch(/first para\n\nsecond para/);
  });
});

describe("round-trip with deltaToMarkdown", () => {
  test("headers, lists, emphasis, links, and code survive a round trip", async () => {
    const markdown = [
      "# Title",
      "",
      "Some **bold** and _italic_ text with a [link](https://example.com).",
      "",
      "## Section",
      "",
      "- item one",
      "- item two with `code`",
      "",
      "```bash",
      "echo hello",
      "```",
    ].join("\n");

    const ops = markdownToOps(markdown);
    const back = await Effect.runPromise(deltaToMarkdown(ops));

    expect(back).toContain("# Title");
    expect(back).toContain("**bold**");
    expect(back).toContain("_italic_");
    expect(back).toContain("[link](https://example.com)");
    expect(back).toContain("## Section");
    expect(back).toMatch(/- +item one/); // turndown pads list markers
    expect(back).toContain("`code`");
    expect(back).toContain("echo hello");
  });
});
