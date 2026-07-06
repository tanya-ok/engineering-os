//! Markdown chunker: split by heading, then hard-split oversized sections.
//! Returns (heading, content) pairs where content includes the heading line so
//! lexical search matches heading terms. Splitting works on byte offsets into a
//! single owned string (no per-iteration reallocation).

const MAX_CHUNK_CHARS: usize = 1500;
const MIN_CHUNK_CHARS: usize = 40;

pub struct Chunk {
    pub heading: String,
    pub content: String,
}

pub fn chunk_markdown(text: &str) -> Vec<Chunk> {
    let mut sections: Vec<(String, Vec<&str>)> = vec![(String::new(), Vec::new())];
    for line in text.lines() {
        if line.starts_with('#') {
            let heading = line.trim_start_matches('#').trim().to_string();
            sections.push((heading, vec![line]));
        } else {
            sections
                .last_mut()
                .expect("sections is seeded with one element and never emptied")
                .1
                .push(line);
        }
    }

    let mut chunks = Vec::new();
    for (heading, lines) in sections {
        let joined = lines.join("\n");
        let mut body = joined.trim();
        if body.chars().count() < MIN_CHUNK_CHARS {
            continue;
        }
        loop {
            if body.chars().count() <= MAX_CHUNK_CHARS {
                if body.chars().count() >= MIN_CHUNK_CHARS {
                    chunks.push(Chunk {
                        heading: heading.clone(),
                        content: body.to_string(),
                    });
                }
                break;
            }
            let cut = split_byte(body);
            if cut == 0 {
                break; // safety: never spin without progress
            }
            let (head, tail) = body.split_at(cut);
            let head = head.trim();
            if head.chars().count() >= MIN_CHUNK_CHARS {
                chunks.push(Chunk {
                    heading: heading.clone(),
                    content: head.to_string(),
                });
            }
            body = tail.trim_start();
        }
    }
    chunks
}

/// Byte offset to cut at: prefer the last paragraph break within the first
/// MAX_CHUNK_CHARS characters (if the prefix is long enough), else a hard cut at
/// the MAX_CHUNK_CHARS-th character boundary. Always a valid char boundary.
fn split_byte(body: &str) -> usize {
    let max_byte = body
        .char_indices()
        .nth(MAX_CHUNK_CHARS)
        .map(|(i, _)| i)
        .unwrap_or(body.len());
    let window = &body[..max_byte];
    if let Some(idx) = window.rfind("\n\n")
        && body[..idx].chars().count() >= MIN_CHUNK_CHARS
    {
        return idx;
    }
    max_byte
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_section_is_dropped() {
        assert!(chunk_markdown("# Tiny\n\ntoo short").is_empty());
    }

    #[test]
    fn normal_section_is_one_chunk_including_heading() {
        let text = format!("# Runbook\n\n{}", "word ".repeat(40));
        let chunks = chunk_markdown(&text);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].content.starts_with("# Runbook"));
        assert_eq!(chunks[0].heading, "Runbook");
    }

    #[test]
    fn oversized_section_splits_on_paragraph_break() {
        let para = "x".repeat(900);
        let text = format!("# Big\n{para}\n\n{para}");
        let chunks = chunk_markdown(&text);
        assert!(chunks.len() >= 2, "expected a split, got {}", chunks.len());
        for c in &chunks {
            assert!(c.content.chars().count() <= MAX_CHUNK_CHARS + "# Big\n".len());
        }
    }

    #[test]
    fn oversized_section_without_break_hard_cuts() {
        let text = format!("# Solid\n{}", "y".repeat(4000));
        let chunks = chunk_markdown(&text);
        assert!(chunks.len() >= 3);
        for c in &chunks {
            assert!(c.content.chars().count() <= MAX_CHUNK_CHARS + 16);
        }
    }

    #[test]
    fn multibyte_content_does_not_panic() {
        // Cyrillic is 2 bytes per char; byte-offset cutting must respect chars.
        let text = format!("# Заголовок\n{}", "ф".repeat(4000));
        let chunks = chunk_markdown(&text);
        assert!(!chunks.is_empty());
    }
}
