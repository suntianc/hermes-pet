/**
 * 文本分段与校验工具
 */

export interface TextChunk {
  text: string;
  charCount: number;
}

/**
 * 单句切分（中文按句号等切，英文按句点切）
 */
const SENTENCE_SEPARATORS = /(?<=[。！？；\n\r.!?;])\s*/;

/**
 * 将长文本按最大字数分段
 * 优先按句子分割，次按逗号，最后硬切
 */
export function splitText(text: string, maxChars: number): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 如果在限制内，直接返回
  if (trimmed.length <= maxChars) {
    return [{ text: trimmed, charCount: trimmed.length }];
  }

  // 先按句子分割
  const sentences = trimmed.split(SENTENCE_SEPARATORS).filter(s => s.trim().length > 0);

  const chunks: TextChunk[] = [];
  let current = '';

  for (const sentence of sentences) {
    const st = sentence.trim();
    if (!st) continue;

    // 如果这个句子本身就超长
    if (st.length > maxChars) {
      // 先把当前累积的推出去
      if (current) {
        chunks.push({ text: current.trim(), charCount: current.trim().length });
        current = '';
      }
      // 对这个句子按逗号二次分割
      const subParts = st.split(/[，,、]/).filter(s => s.trim().length > 0);
      for (const part of subParts) {
        const pt = part.trim();
        if (pt.length > maxChars) {
          // 还超长就硬切
          let i = 0;
          while (i < pt.length) {
            const segment = pt.slice(i, i + maxChars);
            chunks.push({ text: segment, charCount: segment.length });
            i += maxChars;
          }
        } else {
          chunks.push({ text: pt, charCount: pt.length });
        }
      }
      continue;
    }

    // 正常句子：判断加上当前累积是否超限
    const combined = current ? `${current}${st}` : st;
    if (combined.length <= maxChars) {
      current = combined;
    } else {
      if (current) {
        chunks.push({ text: current.trim(), charCount: current.trim().length });
      }
      current = st;
    }
  }

  // 推入最后剩余的
  if (current) {
    chunks.push({ text: current.trim(), charCount: current.trim().length });
  }

  return chunks;
}

/**
 * 文本校验
 * @returns 空数组表示校验通过，否则返回错误信息列表
 */
export function validateText(text: string, maxChars: number): string[] {
  const errors: string[] = [];
  if (!text || !text.trim()) {
    errors.push('文本内容为空');
  }
  if (text.length > maxChars * 10) {
    errors.push(`文本过长（${text.length} 字），超出最大限制 ${maxChars * 10} 字`);
  }
  return errors;
}
