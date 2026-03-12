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

function normalizeOps(delta: any): DeltaOp[] {
  if (Array.isArray(delta)) return delta;
  if (delta && Array.isArray(delta.ops)) return delta.ops;
  return [];
}

/**
 * Convert Quill Delta content to Markdown.
 *
 * Pipeline: Delta ops → HTML (quill-delta-to-html) → Markdown (turndown)
 */
export const deltaToMarkdown = (delta: any): Effect.Effect<string, DeltaConversionError> =>
  Effect.try({
    try: () => {
      const ops = normalizeOps(delta);
      if (!ops.length) return "";

      const htmlConverter = new QuillDeltaToHtmlConverter(ops, {
        paragraphTag: "p",
      });
      const html = htmlConverter.convert();

      const turndown = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        emDelimiter: "_",
        bulletListMarker: "-",
        hr: "---",
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
          return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
        },
      });

      return turndown.turndown(html).trim();
    },
    catch: (error) => new DeltaConversionError({
      message: `Failed to convert Delta to Markdown: ${error}`,
      cause: error,
    }),
  });

/**
 * Convert Slab post content to Markdown, handling all known content shapes:
 * - Plain string (returned as-is)
 * - Quill Delta ops array
 * - Quill Delta wrapper object { ops: [...] }
 */
export const contentToMarkdown = (content: any): Effect.Effect<string, DeltaConversionError> => {
  if (typeof content === "string") return Effect.succeed(content.trim());

  if (Array.isArray(content) || (content && Array.isArray(content.ops))) {
    return deltaToMarkdown(content);
  }

  return Effect.succeed("");
};
