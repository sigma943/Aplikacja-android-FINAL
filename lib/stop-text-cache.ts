// Cache only immutable string results, never stop objects or coordinates.
// Bound both entry count and text length so live feeds cannot grow memory forever.
const MAX_ENTRIES = 8192;
const MAX_TEXT_LENGTH = 512;

export function cachedStopText(transform: (text: string) => string) {
  const results = new Map<string, string>();
  return (text: string): string => {
    const cached = results.get(text);
    if (cached !== undefined) return cached;
    const result = transform(text);
    if (text.length <= MAX_TEXT_LENGTH && result.length <= MAX_TEXT_LENGTH) {
      if (results.size >= MAX_ENTRIES) results.delete(results.keys().next().value!);
      results.set(text, result);
    }
    return result;
  };
}
