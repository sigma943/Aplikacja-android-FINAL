export const WIDGET_REFRESH_PRESETS = [1, 2, 5, 15, 30, 60, 120] as const;
export const DEFAULT_WIDGET_REFRESH_MINUTES = 30;
export function isValidWidgetRefreshMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;
}
export function normalizeWidgetRefreshMinutes(value: unknown) {
  return isValidWidgetRefreshMinutes(value) ? value : DEFAULT_WIDGET_REFRESH_MINUTES;
}
