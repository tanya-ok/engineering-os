// Markdown chunker: split by heading, then hard-split oversized sections.
// Content includes the heading line so lexical search matches heading terms.
// All length math is in Unicode code points, never UTF-16 units, so a cut can
// never land inside a surrogate pair.

export const MAX_CHUNK_CHARS = 1500;
export const MIN_CHUNK_CHARS = 40;

export interface Chunk {
  heading: string;
  content: string;
}

function cpLength(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

// UTF-16 offset of the code point with index `cp`, or s.length if past the end.
function cpOffset(s: string, cp: number): number {
  let seen = 0;
  for (let i = 0; i < s.length; ) {
    if (seen === cp) return i;
    const code = s.codePointAt(i);
    i += code !== undefined && code > 0xffff ? 2 : 1;
    seen += 1;
  }
  return s.length;
}

// Cut offset (UTF-16 units, always a code point boundary): prefer the last
// paragraph break within the first MAX_CHUNK_CHARS code points when the prefix
// is long enough, else a hard cut at the MAX_CHUNK_CHARS-th code point.
function splitOffset(body: string): number {
  const maxOffset = cpOffset(body, MAX_CHUNK_CHARS);
  const idx = body.slice(0, maxOffset).lastIndexOf("\n\n");
  if (idx > 0 && cpLength(body.slice(0, idx)) >= MIN_CHUNK_CHARS) {
    return idx;
  }
  return maxOffset;
}

export function chunkMarkdown(text: string): Chunk[] {
  const sections: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) {
      sections.push({ heading: line.replace(/^#+/, "").trim(), lines: [line] });
    } else {
      const last = sections[sections.length - 1];
      if (last !== undefined) last.lines.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const { heading, lines } of sections) {
    let body = lines.join("\n").trim();
    if (cpLength(body) < MIN_CHUNK_CHARS) continue;
    for (;;) {
      const len = cpLength(body);
      if (len <= MAX_CHUNK_CHARS) {
        if (len >= MIN_CHUNK_CHARS) chunks.push({ heading, content: body });
        break;
      }
      const cut = splitOffset(body);
      if (cut === 0) break;
      const head = body.slice(0, cut).trim();
      if (cpLength(head) >= MIN_CHUNK_CHARS) chunks.push({ heading, content: head });
      body = body.slice(cut).replace(/^\s+/, "");
    }
  }
  return chunks;
}
