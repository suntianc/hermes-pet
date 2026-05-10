use std::collections::VecDeque;

use crate::tts::config::TTSSpeakOptions;

/// A single text chunk after splitting (matching Electron TextChunk)
#[derive(Debug, Clone)]
pub struct TextChunk {
    pub text: String,
    pub char_count: usize,
}

/// Split sentences from text on sentence-ending punctuation.
/// Handles both Chinese and English sentence separators.
fn split_sentences(text: &str) -> Vec<String> {
    let separators = ['。', '！', '？', '；', '\n', '\r', '.', '!', '?', ';'];
    let mut sentences = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if separators.contains(&ch) {
            let trimmed = current.trim().to_string();
            if !trimmed.is_empty() {
                sentences.push(trimmed);
            }
            current.clear();
        }
    }
    let remaining = current.trim().to_string();
    if !remaining.is_empty() {
        sentences.push(remaining);
    }
    sentences
}

/// Split a sentence that exceeds max_chars by commas.
fn split_by_commas(text: &str, _max: usize) -> Vec<String> {
    let comma_seps = ['，', ',', '、'];
    let mut parts = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if comma_seps.contains(&ch) {
            let trimmed = current.trim().to_string();
            if !trimmed.is_empty() {
                parts.push(trimmed);
            }
            current.clear();
        }
    }
    let remaining = current.trim().to_string();
    if !remaining.is_empty() {
        parts.push(remaining);
    }
    if parts.is_empty() {
        parts.push(text.to_string());
    }
    parts
}

/// Hard split text at max_chars
fn hard_split(text: &str, max: usize) -> Vec<String> {
    let mut parts = Vec::new();
    let mut pos = 0;
    let chars: Vec<char> = text.chars().collect();
    while pos < chars.len() {
        let end = std::cmp::min(pos + max, chars.len());
        let segment: String = chars[pos..end].iter().collect();
        if !segment.trim().is_empty() {
            parts.push(segment);
        }
        pos = end;
    }
    parts
}

/// Split long text into chunks by sentence → comma → hard split.
///
/// Exact port of Electron text-utils.ts splitText() logic:
/// 1. Under limit → single chunk
/// 2. Split by sentence boundaries
/// 3. Sentences under max_chars → accumulate
/// 4. Sentences over max_chars → split by comma
/// 5. Sub-parts over max_chars → hard split at max_chars
pub fn split_text(text: &str, max_chars: u32) -> Vec<TextChunk> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return vec![];
    }

    let max = max_chars as usize;

    // Under limit: single chunk
    if trimmed.chars().count() <= max {
        return vec![TextChunk {
            text: trimmed.to_string(),
            char_count: trimmed.chars().count(),
        }];
    }

    let mut result: Vec<TextChunk> = Vec::new();
    let mut current = String::new();

    // Split into sentences first
    let sentences = split_sentences(trimmed);

    for sentence in &sentences {
        if sentence.is_empty() {
            continue;
        }

        // If adding this sentence would exceed max_chars, flush current buffer
        let would_exceed = current.chars().count() + sentence.chars().count() > max;
        if !current.is_empty() && would_exceed {
            result.push(TextChunk {
                text: current.trim().to_string(),
                char_count: current.trim().chars().count(),
            });
            current.clear();
        }

        // If the sentence itself is within max, add to current buffer
        if sentence.chars().count() <= max {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(sentence.trim());
        } else {
            // Sentence exceeds max — flush any accumulated buffer first
            if !current.is_empty() {
                result.push(TextChunk {
                    text: current.trim().to_string(),
                    char_count: current.trim().chars().count(),
                });
                current.clear();
            }

            // Try comma split
            let comma_parts = split_by_commas(sentence, max);
            for part in &comma_parts {
                if part.chars().count() <= max {
                    if !current.is_empty() {
                        current.push(' ');
                    }
                    current.push_str(part.trim());
                } else {
                    // Part still exceeds max — hard split
                    if !current.is_empty() {
                        result.push(TextChunk {
                            text: current.trim().to_string(),
                            char_count: current.trim().chars().count(),
                        });
                        current.clear();
                    }
                    let hard_parts = hard_split(part, max);
                    for hp in hard_parts {
                        result.push(TextChunk {
                            text: hp.trim().to_string(),
                            char_count: hp.trim().chars().count(),
                        });
                    }
                }
            }
        }
    }

    // Flush remaining buffer
    if !current.is_empty() {
        result.push(TextChunk {
            text: current.trim().to_string(),
            char_count: current.trim().chars().count(),
        });
    }

    result
}

/// Validate text before TTS processing.
/// Returns error messages if text fails validation.
/// Matching Electron validate_text() logic.
pub fn validate_text(text: &str, max_chars: u32) -> Vec<String> {
    let mut errors = Vec::new();

    if text.trim().is_empty() {
        errors.push("Text is empty after trimming".into());
        return errors;
    }

    let max_allowed = max_chars * 10;
    if text.chars().count() as u32 > max_allowed {
        errors.push(format!(
            "Text exceeds maximum length of {} characters (max_chars * 10)",
            max_allowed
        ));
    }

    errors
}

/// An item in the TTS processing queue
#[derive(Debug, Clone)]
pub struct QueueItem {
    pub id: String,
    pub text: String,
    pub options: Option<TTSSpeakOptions>,
    pub chunks: Vec<TextChunk>,
    pub current_chunk: usize,
}

impl QueueItem {
    pub fn new(text: String, options: Option<TTSSpeakOptions>, max_chars: u32) -> Self {
        let chunks = split_text(&text, max_chars);
        Self {
            id: format!("tts_{}", chrono::Utc::now().timestamp_millis()),
            text,
            options,
            chunks,
            current_chunk: 0,
        }
    }

    pub fn is_complete(&self) -> bool {
        self.current_chunk >= self.chunks.len()
    }
}

/// FIFO queue for TTS requests.
/// Port of Electron TTSManager queue management.
#[derive(Debug)]
pub struct TtsQueue {
    items: VecDeque<QueueItem>,
    is_processing: bool,
}

impl TtsQueue {
    pub fn new() -> Self {
        Self {
            items: VecDeque::new(),
            is_processing: false,
        }
    }

    /// Enqueue a new TTS request
    pub fn enqueue(
        &mut self,
        text: String,
        options: Option<TTSSpeakOptions>,
        max_chars: u32,
    ) -> Option<String> {
        let item = QueueItem::new(text, options, max_chars);
        let id = item.id.clone();
        self.items.push_back(item);
        Some(id)
    }

    /// Dequeue the next item (FIFO)
    pub fn dequeue(&mut self) -> Option<QueueItem> {
        self.items.pop_front()
    }

    /// Peek at the next item without removing
    pub fn peek(&self) -> Option<&QueueItem> {
        self.items.front()
    }

    /// Clear all pending items
    pub fn clear(&mut self) {
        self.items.clear();
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn is_processing(&self) -> bool {
        self.is_processing
    }

    pub fn set_processing(&mut self, processing: bool) {
        self.is_processing = processing;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_text_short() {
        let chunks = split_text("Hello world", 500);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "Hello world");
    }

    #[test]
    fn test_split_text_empty() {
        let chunks = split_text("", 500);
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_split_text_by_sentence() {
        let text = "First sentence. Second sentence. Third sentence.";
        let chunks = split_text(text, 20);
        assert!(chunks.len() > 1, "Should split into multiple chunks");
        assert!(chunks[0].char_count <= 20);
    }

    #[test]
    fn test_validate_empty() {
        let errors = validate_text("", 500);
        assert!(!errors.is_empty());
    }

    #[test]
    fn test_queue_fifo() {
        let mut queue = TtsQueue::new();
        queue.enqueue("first".into(), None, 500);
        queue.enqueue("second".into(), None, 500);

        let first = queue.dequeue();
        assert_eq!(first.unwrap().text, "first");

        let second = queue.dequeue();
        assert_eq!(second.unwrap().text, "second");

        assert!(queue.is_empty());
    }

    #[test]
    fn test_queue_clear() {
        let mut queue = TtsQueue::new();
        queue.enqueue("one".into(), None, 500);
        queue.enqueue("two".into(), None, 500);
        queue.clear();
        assert!(queue.is_empty());
    }

    #[test]
    fn test_queue_item_complete() {
        let item = QueueItem::new("test".into(), None, 500);
        assert!(!item.is_complete());
    }

    #[test]
    fn test_split_text_chinese() {
        let text = "你好世界！这是一个测试。另一个句子。";
        let chunks = split_text(text, 10);
        assert!(chunks.len() >= 2, "Chinese text with sentence separators should split");
        for chunk in &chunks {
            assert!(chunk.char_count <= 10, "Each chunk should be <= max_chars");
        }
    }
}
