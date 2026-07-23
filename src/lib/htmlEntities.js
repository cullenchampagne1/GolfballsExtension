/* Decode the small HTML-entity surface returned by catalog/import feeds.
   Kept dependency-free so storage and share-file normalization stays directly
   unit-testable without loading the catalog's bundled JSON seed. */
export function decodeEntities(value) {
  let text = String(value || '');
  for (let i = 0; i < 3 && /&[#a-z0-9]+;/i.test(text); i++) {
    text = text
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return match; } })
      .replace(/&#(\d+);/g, (match, decimal) => { try { return String.fromCodePoint(parseInt(decimal, 10)); } catch { return match; } })
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&');
  }
  return text;
}
