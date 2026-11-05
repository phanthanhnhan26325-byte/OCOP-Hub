/** Keep the product information card concise, including older multi-section descriptions. */
export function productDescription(shortDescription: string | null, description: string | null) {
  const text = (shortDescription?.trim() || description?.trim() || '')
    .replace(/^\d+\.\s*Giới thiệu sản phẩm\s*/iu, '')
    .split(/\n\s*\n|\n\s*\d+\.\s/u)[0]
    .replace(/\s+/gu, ' ')
    .trim();

  if (text.length <= 360) return text;

  const excerpt = text.slice(0, 361);
  const sentenceEnd = Math.max(excerpt.lastIndexOf('. '), excerpt.lastIndexOf('! '), excerpt.lastIndexOf('? '));
  if (sentenceEnd >= 160) return excerpt.slice(0, sentenceEnd + 1);

  return `${excerpt.slice(0, excerpt.lastIndexOf(' ')).replace(/[,;:]$/u, '')}…`;
}
