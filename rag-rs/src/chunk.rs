//! Markdown chunker. Mirrors the Python version: split by heading, then hard
//! split oversized sections. Returns (heading, content) pairs where content
//! includes the heading line so lexical search matches heading terms.

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
            sections.last_mut().unwrap().1.push(line);
        }
    }

    let mut chunks = Vec::new();
    for (heading, lines) in sections {
        let mut body = lines.join("\n").trim().to_string();
        if body.chars().count() < MIN_CHUNK_CHARS {
            continue;
        }
        while body.chars().count() > MAX_CHUNK_CHARS {
            let cut = split_point(&body);
            let head: String = body.chars().take(cut).collect();
            chunks.push(Chunk {
                heading: heading.clone(),
                content: head.trim().to_string(),
            });
            body = body
                .chars()
                .skip(cut)
                .collect::<String>()
                .trim()
                .to_string();
        }
        if body.chars().count() >= MIN_CHUNK_CHARS {
            chunks.push(Chunk {
                heading: heading.clone(),
                content: body,
            });
        }
    }
    chunks
}

/// Prefer a paragraph break before MAX_CHUNK_CHARS; fall back to a hard cut.
fn split_point(body: &str) -> usize {
    let window: String = body.chars().take(MAX_CHUNK_CHARS).collect();
    if let Some(idx) = window.rfind("\n\n") {
        let count = window[..idx].chars().count();
        if count >= MIN_CHUNK_CHARS {
            return count;
        }
    }
    MAX_CHUNK_CHARS
}
