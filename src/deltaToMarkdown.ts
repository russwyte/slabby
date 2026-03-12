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

import { QuillDeltaToHtmlConverter } from "quill-delta-to-html";
import TurndownService from "turndown";

/**
 * A single Quill Delta operation
 */
interface DeltaOp {
  insert: any;
  attributes?: Record<string, any>;
}

/**
 * Quill Delta — can be a bare ops array or a wrapper object
 */
type Delta = DeltaOp[] | { ops: DeltaOp[] };

/**
 * Normalize Delta input to a plain ops array
 */
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
export function deltaToMarkdown(delta: any): string {
  const ops = normalizeOps(delta);
  if (!ops.length) return "";

  // --- Step 1: Delta → HTML ---
  const htmlConverter = new QuillDeltaToHtmlConverter(ops, {
    // Use <p> for paragraphs so turndown can process them cleanly
    paragraphTag: "p",
  });
  const html = htmlConverter.convert();

  // --- Step 2: HTML → Markdown ---
  const turndown = new TurndownService({
    headingStyle: "atx",           // # Heading
    codeBlockStyle: "fenced",      // ```code```
    emDelimiter: "_",              // _emphasis_
    bulletListMarker: "-",         // - list item
    hr: "---",
  });

  // Custom rule: fenced code blocks with language annotation
  turndown.addRule("fencedCodeBlocks", {
    filter: (node: any) =>
      node.nodeName === "PRE" &&
      !!node.firstChild &&
      node.firstChild.nodeName === "CODE",
    replacement: (_content: string, node: any) => {
      const codeNode = node.firstChild;
      const className = codeNode?.getAttribute?.("class") || "";
      const langMatch = className.match(/language-([a-z0-9_+-]+)/i);
      const lang = langMatch ? langMatch[1] : "";
      const code = codeNode?.textContent ?? "";
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    },
  });

  return turndown.turndown(html).trim();
}

/**
 * Convert Slab post content to Markdown, handling all known content shapes:
 * - Plain string (returned as-is)
 * - Quill Delta ops array
 * - Quill Delta wrapper object { ops: [...] }
 */
export function contentToMarkdown(content: any): string {
  // Already a plain string — return as-is
  if (typeof content === "string") return content.trim();

  // Quill Delta (array of ops or { ops: [...] })
  if (Array.isArray(content) || (content && Array.isArray(content.ops))) {
    return deltaToMarkdown(content);
  }

  return "";
}
