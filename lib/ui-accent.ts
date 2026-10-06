/** Shared UI colours. Carrier and punctuality colours remain independent. */
export function normalizeUiAccent(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#00a3a2';
}

function channels(hex: string) {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}

function mix(hex: string, target: number, amount: number) {
  return '#' + channels(hex).map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string) {
  const linear = channels(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function uiAccentContrast(value: string) {
  const accent = normalizeUiAccent(value);
  if (contrast(accent, '#071017') >= 4.5) return '#071017';
  return contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000';
}

function readableAccentText(accent: string, isDark: boolean) {
  let amount = isDark ? 0.3 : 0.4;
  let text = mix(accent, isDark ? 255 : 0, amount);
  while (contrast(text, isDark ? '#111c25' : '#ffffff') < 5 && amount < 1) {
    amount = Math.min(1, amount + 0.05);
    text = mix(accent, isDark ? 255 : 0, amount);
  }
  return text;
}

export function uiAccentVariables(value: string, isDark = true): Record<string, string> {
  const accent = normalizeUiAccent(value);
  return {
    '--pks-accent': accent,
    '--pks-accent-text': readableAccentText(accent, isDark),
    '--pks-accent-soft': accent + (isDark ? '1a' : '12'),
    '--pks-accent-hover': accent + '28',
    '--pks-accent-border': accent + '60',
    '--pks-accent-on': uiAccentContrast(accent),
  };
}
