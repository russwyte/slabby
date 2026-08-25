/**
 * Quill Delta → Markdown converter
 *
 * Slab stores post content in Quill Delta format (an array of insert operations
 * with optional formatting attributes). The previous `deltaToPlainText()` function
 * stripped all formatting by concatenating raw insert strings.
 *
 * This module converts Delta → HTML (via quill-delta-to-html) → Markdown (via turndown),
 * preserving headings, lists, links, code blocks, emphasis, images, etc.
 */

import { Effect, Data } from "effect";
import { QuillDeltaToHtmlConverter } from "quill-delta-to-html";
import TurndownService from "turndown";

export class DeltaConversionError extends Data.TaggedError("DeltaConversionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface DeltaOp {
  insert: any;
  attributes?: Record<string, any>;
}

/**
 * Slab's GraphQL API returns post content as a JSON-encoded string holding the
 * Delta ops array, so strings are decoded before shape-matching.
 */
export function normalizeOps(delta: any): DeltaOp[] {
  if (typeof delta === "string") {
    try {
      delta = JSON.parse(delta);
    } catch {
      return [];
    }
  }
  if (Array.isArray(delta)) return delta;
  if (delta && Array.isArray(delta.ops)) return delta.ops;
  return [];
}

/**
 * Slab stores some content as custom embeds that quill-delta-to-html does not
 * understand and would silently drop: fenced code (`code-embed`), horizontal
 * rules (`hr`), images (`image: [{source}]`), and user/post mentions
 * (`mention`). Split the ops into segments so those render as markdown
 * directly, and only standard rich text goes through the HTML pipeline.
 */
type Segment =
  | { type: "delta"; ops: DeltaOp[] }
  | { type: "code"; language?: string; text: string }
  | { type: "hr" }
  | { type: "image"; source: string };

/**
 * Pick a backtick fence longer than any backtick run inside the code, so code
 * that itself contains ``` lines survives a read-modify-write round trip
 * (CommonMark's standard escape).
 */
function fenceFor(code: string): string {
  const longest = (code.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function segmentOps(ops: DeltaOp[]): Segment[] {
  const segments: Segment[] = [];
  let current: DeltaOp[] = [];
  const flush = () => {
    if (current.length) {
      segments.push({ type: "delta", ops: current });
      current = [];
    }
  };

  for (const op of ops) {
    const insert = op.insert;
    if (insert && typeof insert === "object") {
      const embed = insert as Record<string, any>;

      if (Array.isArray(embed["code-embed"])) {
        flush();
        const text = embed["code-embed"]
          .map((o: any) => (typeof o?.insert === "string" ? o.insert : ""))
          .join("");
        segments.push({ type: "code", language: op.attributes?.language, text });
        continue;
      }

      if (embed.hr) {
        flush();
        segments.push({ type: "hr" });
        continue;
      }

      if (embed.image) {
        const source = Array.isArray(embed.image)
          ? embed.image[0]?.source
          : typeof embed.image === "string"
            ? embed.image
            : embed.image?.source;
        if (source) {
          flush();
          segments.push({ type: "image", source });
        }
        continue;
      }

      if (embed.mention) {
        // Mentions carry their display text in attributes; render inline.
        const text = op.attributes?.["mention-text"] ?? op.attributes?.content ?? "";
        if (text) current.push({ insert: String(text) });
        continue;
      }

      // Other unknown embeds (e.g. table-embed) still fall through to the
      // HTML pipeline, which drops them.
    }
    current.push(op);
  }

  flush();
  return segments;
}

function richDeltaToMarkdown(ops: DeltaOp[]): string {
  const htmlConverter = new QuillDeltaToHtmlConverter(ops, {
    paragraphTag: "p",
    // Keep separate delta lines as separate paragraphs — the default merges
    // them into one <p> with <br/>s, which reads back as hard-break lines.
    multiLineParagraph: false,
  });
  const html = htmlConverter.convert();

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    bulletListMarker: "-",
    hr: "---",
  });

  // turndown drops <s>/<del>/<strike> by default, losing strikethrough
  turndown.addRule("strikethrough", {
    filter: ["s", "del", "strike"] as any,
    replacement: (content) => `~~${content}~~`,
  });

  // Slab checklists arrive as <li data-checked="true|false"> (from delta
  // list: "checked"/"unchecked"); without this rule they'd flatten to plain
  // bullets and every read-modify-write would destroy checkbox state.
  turndown.addRule("taskListItems", {
    filter: (node) =>
      node.nodeName === "LI" && (node as Element).getAttribute?.("data-checked") != null,
    replacement: (content, node) => {
      const checked = (node as Element).getAttribute("data-checked") === "true";
      return `- [${checked ? "x" : " "}] ${content.trim()}\n`;
    },
  });

  turndown.addRule("fencedCodeBlocks", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      !!node.firstChild &&
      node.firstChild.nodeName === "CODE",
    replacement: (_content, node) => {
      const codeNode = node.firstChild as Element;
      const className = codeNode.getAttribute?.("class") || "";
      const langMatch = className.match(/language-([a-z0-9_+-]+)/i);
      const lang = langMatch ? langMatch[1] : "";
      const code = codeNode.textContent ?? "";
      const fence = fenceFor(code);
      return `\n${fence}${lang}\n${code}\n${fence}\n`;
    },
  });

  return turndown.turndown(html).trim();
}

/**
 * Convert Quill Delta content to Markdown.
 *
 * Pipeline: Delta ops → segments (Slab custom embeds handled directly) →
 * HTML (quill-delta-to-html) → Markdown (turndown) for rich-text segments.
 */
export const deltaToMarkdown = (delta: any): Effect.Effect<string, DeltaConversionError> =>
  Effect.try({
    try: () => {
      const ops = normalizeOps(delta);
      if (!ops.length) return "";

      const parts = segmentOps(ops).map((segment) => {
        switch (segment.type) {
          case "delta":
            return richDeltaToMarkdown(segment.ops);
          case "code": {
            const body = segment.text.replace(/\n$/, "");
            const fence = fenceFor(body);
            return `${fence}${segment.language ?? ""}\n${body}\n${fence}`;
          }
          case "hr":
            return "---";
          case "image":
            return `![](${segment.source})`;
        }
      });

      return parts.filter((part) => part.length > 0).join("\n\n").trim();
    },
    catch: (error) => new DeltaConversionError({
      message: `Failed to convert Delta to Markdown: ${error}`,
      cause: error,
    }),
  });

/**
 * Convert Slab post content to Markdown, handling all known content shapes:
 * - JSON-encoded Delta string (what the Slab API actually returns)
 * - Quill Delta ops array
 * - Quill Delta wrapper object { ops: [...] }
 * - Plain non-JSON string (returned as-is)
 */
export const contentToMarkdown = (content: any): Effect.Effect<string, DeltaConversionError> => {
  const ops = normalizeOps(content);
  if (ops.length) return deltaToMarkdown(ops);

  if (typeof content === "string") return Effect.succeed(content.trim());

  return Effect.succeed("");
};
