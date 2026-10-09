export const WIDGET_ACCENTS = [
  { color: '#14b8a6', name: 'Turkus' }, { color: '#3b82f6', name: 'Niebieski' },
  { color: '#8b5cf6', name: 'Fiolet' }, { color: '#ec4899', name: 'Różowy' },
  { color: '#f97316', name: 'Pomarańczowy' }, { color: '#eab308', name: 'Złoty' },
  { color: '#22c55e', name: 'Zielony' }, { color: '#64748b', name: 'Grafit' },
] as const;

export interface WidgetAppearance {
  transparency: number;
  accentColor: string;
  cornerRadius: number;
  surface: 'tinted' | 'neutral';
  density: 'comfortable' | 'compact';
  textSize: 'small' | 'normal' | 'large';
  lineColors: 'carrier' | 'accent';
  showDirections: boolean;
  showStatus: boolean;
  showDelay: boolean;
  showSeparators: boolean;
  highlightNext: boolean;
  softBackground: boolean;
  softBackgroundStrength: number;
}

export const DEFAULT_WIDGET_APPEARANCE: WidgetAppearance = {
  transparency: 20, accentColor: '#14b8a6', cornerRadius: 24, surface: 'tinted',
  density: 'comfortable', textSize: 'normal', lineColors: 'carrier',
  showDirections: true, showStatus: true, showDelay: true,
  showSeparators: true, highlightNext: true, softBackground: false, softBackgroundStrength: 40,
};

export function normalizeWidgetAppearance(value: Partial<WidgetAppearance> = {}): WidgetAppearance {
  const defaults = DEFAULT_WIDGET_APPEARANCE;
  const number = (input: unknown, fallback: number, max: number) =>
    typeof input === 'number' && Number.isFinite(input) ? Math.max(0, Math.min(max, Math.round(input))) : fallback;
  return {
    transparency: number(value.transparency, defaults.transparency, 100),
    cornerRadius: number(value.cornerRadius, defaults.cornerRadius, 32),
    accentColor: /^#[\da-f]{6}$/i.test(value.accentColor ?? '') ? value.accentColor!.toLowerCase() : defaults.accentColor,
    surface: value.surface === 'neutral' ? 'neutral' : defaults.surface,
    density: value.density === 'compact' ? 'compact' : defaults.density,
    textSize: value.textSize === 'small' || value.textSize === 'large' ? value.textSize : defaults.textSize,
    lineColors: value.lineColors === 'accent' ? 'accent' : defaults.lineColors,
    showDirections: value.showDirections !== false, showStatus: value.showStatus !== false,
    showDelay: value.showDelay !== false, showSeparators: value.showSeparators !== false,
    highlightNext: value.highlightNext !== false,
    softBackground: value.softBackground === true,
    softBackgroundStrength: number(value.softBackgroundStrength, defaults.softBackgroundStrength, 100),
  };
}

export function widgetRgb(color: string) {
  return [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
}
export function widgetRgba(color: string, opacity: number) {
  return `rgba(${widgetRgb(color).join(',')},${opacity})`;
}
export function widgetSurfaceColors(appearance: WidgetAppearance, dark: boolean) {
  const base = dark ? '#101e26' : '#f8fafc';
  const mix = (amount: number) => {
    const accent = widgetRgb(appearance.accentColor);
    return '#' + widgetRgb(base).map((channel, index) => Math.round(channel * (1 - amount) + accent[index] * amount).toString(16).padStart(2, '0')).join('');
  };
  return appearance.surface === 'neutral' ? [base, base] : [mix(.16), mix(.04)];
}

/** Keep accents readable on the selected light/dark surface, including custom colours. */
export function widgetAccentColor(color: string, dark: boolean) {
  const luminance = (rgb: number[]) => rgb.map(channel => {
    const s = channel / 255; return s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
  }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const background = luminance(widgetRgb(dark ? '#101e26' : '#f8fafc'));
  let rgb = widgetRgb(color);
  for (let i = 0; i < 24; i++) {
    const light = luminance(rgb);
    if ((Math.max(light, background) + .05) / (Math.min(light, background) + .05) >= 4.5) break;
    rgb = rgb.map(channel => Math.round(channel * .9 + (dark ? 255 : 0) * .1));
  }
  return '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('');
}
