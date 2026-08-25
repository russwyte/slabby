/**
 * Markdown → Quill Delta converter targeting Slab's delta dialect.
 *
 * Slab stores post content as Quill Delta ops with some Slab-specific shapes
 * (observed from real posts returned by the API):
 *
 * - Block formats live on the line-terminating "\n" op:
 *   `{header: 1..3}`, `{list: "bullet"|"ordered"|"unchecked"|"checked", indent?: N}`,
 *   `{blockquote: true}`
 * - Inline formats: `{bold, italic, strike, code, link}`
 * - Block embeds are standalone insert ops with NO trailing "\n":
 *   `{insert: {"hr": true}}`
 *   `{insert: {"image": [{source: url}]}}`
 *   `{insert: {"code-embed": [innerOps]}, attributes: {language?}}`
 *
 * The converter is intentionally conservative: constructs it does not
 * recognize fall through as plain text, so content is never dropped.
 */

import { Effect, Data } from "effect";

export class MarkdownConversionError extends Data.TaggedError("MarkdownConversionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface DeltaOp {
  insert: string | Record<string, any>;
  attributes?: Record<string, any>;
}

type InlineAttrs = Record<string, any>;

const MAX_HEADER_LEVEL = 3;

/** Strip markdown backslash-escapes (turndown escapes `* _ [ ] # etc. on read). */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1");
}

function pushText(ops: DeltaOp[], text: string, attrs: InlineAttrs): void {
  if (!text) return;
  const op: DeltaOp = { insert: text };
  if (Object.keys(attrs).length > 0) op.attributes = { ...attrs };
  ops.push(op);
}

const isWordChar = (ch: string | undefined): boolean => !!ch && /[A-Za-z0-9]/.test(ch);

// Link/image destination: allows one level of balanced parentheses
// (e.g. https://en.wikipedia.org/wiki/Foo_(bar)), plus an optional title.
const LINK_DEST = /\(\s*((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\s*\)/;
const IMAGE_RE = new RegExp(/^!\[([^\]]*)\]/.source + LINK_DEST.source);
const LINK_RE = new RegExp(/^\[([^\]]+)\]/.source + LINK_DEST.source);

/**
 * Parse inline markdown into delta ops, merging `inherited` attributes into
 * everything produced (so `**[link](url)**` yields `{bold: true, link: url}`).
 *
 * Note: markdown images mid-line become LINKS (Slab images are block embeds
 * and cannot legally sit inside a text line); standalone image lines are
 * handled as block embeds in markdownToOps.
 */
export function parseInline(text: string, inherited: InlineAttrs = {}): DeltaOp[] {
  const ops: DeltaOp[] = [];
  let remaining = text;
  let plain = "";
  // Character immediately before the current parse position; "" = boundary.
  // Used to reject intra-word _ / __ emphasis (CommonMark: `snake_case_name`
  // must not become italic).
  let prevChar = "";

  const flushPlain = () => {
    if (plain) {
      pushText(ops, unescapeMarkdown(plain), inherited);
      plain = "";
    }
  };
  const consumePlain = (n: number) => {
    plain += remaining.slice(0, n);
    prevChar = remaining[n - 1] ?? prevChar;
    remaining = remaining.slice(n);
  };
  const consumeMatch = (matched: string) => {
    prevChar = matched[matched.length - 1] ?? prevChar;
    remaining = remaining.slice(matched.length);
  };

  while (remaining.length > 0) {
    // Skip escaped characters so `\*` never opens emphasis.
    if (remaining[0] === "\\" && remaining.length > 1) {
      consumePlain(2);
      continue;
    }

    let matched = false;

    // Inline code: `code`, ``code with ` inside`` — content kept verbatim
    const codeMatch = remaining.match(/^(`+)([\s\S]+?)\1(?!`)/);
    if (codeMatch && !codeMatch[2]!.includes(codeMatch[1]!)) {
      flushPlain();
      let code = codeMatch[2]!;
      // CommonMark: strip one leading+trailing space when both present
      if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") {
        code = code.slice(1, -1);
      }
      pushText(ops, code, { ...inherited, code: true });
      consumeMatch(codeMatch[0]);
      matched = true;
    }

    // Image mid-line: Slab has no inline images, degrade to a link
    if (!matched) {
      const imgMatch = remaining.match(IMAGE_RE);
      if (imgMatch) {
        flushPlain();
        const alt = imgMatch[1]!.trim() || imgMatch[2]!;
        pushText(ops, unescapeMarkdown(alt), { ...inherited, link: imgMatch[2]! });
        consumeMatch(imgMatch[0]);
        matched = true;
      }
    }

    // Link: [text](url) — recurse into the label so styles nest
    if (!matched) {
      const linkMatch = remaining.match(LINK_RE);
      if (linkMatch) {
        flushPlain();
        ops.push(...parseInline(linkMatch[1]!, { ...inherited, link: linkMatch[2]! }));
        consumeMatch(linkMatch[0]);
        matched = true;
      }
    }

    // Bold italic: ***text*** or ___text___ (boundary rules for ___)
    if (!matched) {
      const biMatch = remaining.match(/^(\*\*\*|___)((?:\\.|[^\\])+?)\1/);
      if (biMatch && (biMatch[1] === "***" || (!isWordChar(prevChar) && !isWordChar(remaining[biMatch[0].length])))) {
        flushPlain();
        ops.push(...parseInline(biMatch[2]!, { ...inherited, bold: true, italic: true }));
        consumeMatch(biMatch[0]);
        matched = true;
      }
    }

    // Bold: **text** (intra-word allowed per CommonMark) or __text__ (boundaries only)
    if (!matched) {
      const boldMatch = remaining.match(/^(\*\*|__)((?:\\.|[^\\])+?)\1/);
      if (boldMatch && (boldMatch[1] === "**" || (!isWordChar(prevChar) && !isWordChar(remaining[boldMatch[0].length])))) {
        flushPlain();
        ops.push(...parseInline(boldMatch[2]!, { ...inherited, bold: true }));
        consumeMatch(boldMatch[0]);
        matched = true;
      }
    }

    // Strikethrough: ~~text~~
    if (!matched) {
      const strikeMatch = remaining.match(/^~~((?:\\.|[^\\])+?)~~/);
      if (strikeMatch) {
        flushPlain();
        ops.push(...parseInline(strikeMatch[1]!, { ...inherited, strike: true }));
        consumeMatch(strikeMatch[0]);
        matched = true;
      }
    }

    // Italic: *text* (intra-word allowed) or _text_ (boundaries only, so
    // snake_case identifiers survive)
    if (!matched) {
      const italicMatch = remaining.match(/^([*_])((?:\\.|[^\\*_])+?)\1(?!\1)/);
      if (
        italicMatch &&
        (italicMatch[1] === "*" || (!isWordChar(prevChar) && !isWordChar(remaining[italicMatch[0].length])))
      ) {
        flushPlain();
        ops.push(...parseInline(italicMatch[2]!, { ...inherited, italic: true }));
        consumeMatch(italicMatch[0]);
        matched = true;
      }
    }

    if (!matched) {
      consumePlain(1);
    }
  }

  flushPlain();
  return ops;
}

/**
 * Resolve markdown list nesting to Quill `indent` levels using an indent
 * stack, so both 2-space and 4-space nesting conventions work. A new level
 * requires at least 2 more leading spaces than the current one (a stray
 * single space is not nesting).
 */
class ListIndentTracker {
  // stack[k] = leading-space width that established indent level k
  private stack: number[] = [0];

  levelFor(spaces: number): number {
    while (this.stack.length > 1 && spaces < this.stack[this.stack.length - 1]!) {
      this.stack.pop();
    }
    if (spaces >= this.stack[this.stack.length - 1]! + 2) {
      this.stack.push(spaces);
    }
    return this.stack.length - 1;
  }

  reset(): void {
    this.stack = [0];
  }
}

interface ListLineMatch {
  spaces: number;
  kind: "bullet" | "ordered" | "unchecked" | "checked";
  text: string;
}

function matchListLine(line: string): ListLineMatch | null {
  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
  const ordered = line.match(/^(\s*)\d+\.\s+(.*)$/);
  const m = bullet ?? ordered;
  if (!m) return null;

  let kind: ListLineMatch["kind"] = bullet ? "bullet" : "ordered";
  let text = m[2]!;

  if (bullet) {
    const task = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      kind = task[1] === " " ? "unchecked" : "checked";
      text = task[2]!;
    }
  }

  return { spaces: m[1]!.length, kind, text };
}

/**
 * Convert markdown to Slab-dialect Quill Delta ops. The result always ends
 * with a "\n" insert (or a block embed), keeping the document well-formed.
 */
export function markdownToOps(markdown: string): DeltaOp[] {
  const ops: DeltaOp[] = [];
  // Normalize line endings; strip a UTF-8 BOM if present.
  const lines = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const listTracker = new ListIndentTracker();

  let i = 0;
  let inList = false;
  // Index in `ops` of the "\n" op that ended the last plain-paragraph line;
  // -1 when the previous line was not a plain paragraph. Enables setext
  // headers ("Title\n===" / "Title\n---").
  let lastParagraphNewline = -1;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block → Slab code-embed. Any info string is accepted
    // (```c#, ```node.js, ```python title="x"); the first token becomes the
    // language.
    const fenceMatch = line.match(/^```(.*)$/);
    if (fenceMatch) {
      const info = fenceMatch[1]!.trim();
      const language = info.split(/\s+/)[0] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing fence (or run off the end for unterminated fences)
      const code = codeLines.join("\n") + "\n";
      const embed: DeltaOp = { insert: { "code-embed": [{ insert: code }] } };
      if (language) embed.attributes = { language };
      ops.push(embed);
      inList = false;
      listTracker.reset();
      lastParagraphNewline = -1;
      continue;
    }

    // Blank line: paragraph separator, ends any list run
    if (/^\s*$/.test(line)) {
      inList = false;
      listTracker.reset();
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // Setext headers: a plain paragraph line followed by === (h1) or --- (h2)
    if (lastParagraphNewline >= 0 && /^\s*(={3,}|-{3,})\s*$/.test(line)) {
      const level = line.trim()[0] === "=" ? 1 : 2;
      ops[lastParagraphNewline] = { insert: "\n", attributes: { header: level } };
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      ops.push({ insert: { hr: true } });
      inList = false;
      listTracker.reset();
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // ATX header
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = Math.min(headerMatch[1]!.length, MAX_HEADER_LEVEL);
      ops.push(...parseInline(headerMatch[2]!.trim()));
      ops.push({ insert: "\n", attributes: { header: level } });
      inList = false;
      listTracker.reset();
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // Standalone image line → block embed only
    const soloImage = line.match(new RegExp(/^\s*!\[([^\]]*)\]/.source + LINK_DEST.source + /\s*$/.source));
    if (soloImage) {
      ops.push({ insert: { image: [{ source: soloImage[2]! }] } });
      inList = false;
      listTracker.reset();
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // List item
    const listMatch = matchListLine(line);
    if (listMatch) {
      if (!inList) listTracker.reset();
      inList = true;
      const indent = listTracker.levelFor(listMatch.spaces);
      ops.push(...parseInline(listMatch.text.trim()));
      const attributes: Record<string, any> = { list: listMatch.kind };
      if (indent > 0) attributes.indent = indent;
      ops.push({ insert: "\n", attributes });
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      ops.push(...parseInline(quoteMatch[1]!.trim()));
      ops.push({ insert: "\n", attributes: { blockquote: true } });
      inList = false;
      listTracker.reset();
      lastParagraphNewline = -1;
      i++;
      continue;
    }

    // Plain paragraph line
    ops.push(...parseInline(line.trim()));
    ops.push({ insert: "\n" });
    lastParagraphNewline = ops.length - 1;
    inList = false;
    listTracker.reset();
    i++;
  }

  // Guarantee the delta is non-empty and ends in a newline block
  if (ops.length === 0) ops.push({ insert: "\n" });

  return ops;
}

/**
 * Effect wrapper for markdownToOps.
 */
export const markdownToDelta = (markdown: string): Effect.Effect<DeltaOp[], MarkdownConversionError> =>
  Effect.try({
    try: () => markdownToOps(markdown),
    catch: (error) =>
      new MarkdownConversionError({
        message: `Failed to convert Markdown to Delta: ${error}`,
        cause: error,
      }),
  });

/**
 * Length of delta content in Quill terms: UTF-16 code units for text
 * (matching the JS reference implementation) and 1 per embed.
 */
export function deltaLength(ops: Array<{ insert?: any }>): number {
  return ops.reduce((sum, op) => {
    if (typeof op.insert === "string") return sum + op.insert.length;
    if (op.insert !== undefined) return sum + 1;
    return sum;
  }, 0);
}

/** Slab block embeds terminate their own line (unlike inline embeds such as mentions). */
const BLOCK_EMBED_KEYS = ["code-embed", "hr", "image"];

/** True when the delta's trailing content ends a line (newline or block embed). */
export function endsWithNewline(ops: Array<{ insert?: any }>): boolean {
  for (let i = ops.length - 1; i >= 0; i--) {
    const insert = ops[i]?.insert;
    if (typeof insert === "string") {
      if (insert.length === 0) continue;
      return insert.endsWith("\n");
    }
    if (insert !== undefined) {
      // Block embeds occupy their own line; inline embeds (mentions) do not.
      return BLOCK_EMBED_KEYS.some((key) => key in insert);
    }
  }
  return true; // empty document
}
