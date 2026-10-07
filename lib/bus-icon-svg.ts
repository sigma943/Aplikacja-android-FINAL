const escapeText = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** The same compact bus front is used in Leaflet markers and carrier selection. */
export function busFrontSvg(label: string, color: string, selected = false) {
  const fill = /^#[\da-f]{3,8}$/i.test(color) ? color : '#14b8a6';
  const text = escapeText(label || '?');
  return `<svg class="bus-front-svg" data-bus-glyph viewBox="0 0 34 48" width="34" height="48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="40" width="6" height="7" rx="1.5" fill="#1e293b"/><rect x="23" y="40" width="6" height="7" rx="1.5" fill="#1e293b"/>
    <rect x="1" y="1" width="32" height="41" rx="7" fill="${fill}" stroke="white" stroke-width="2"/>
    <text x="17" y="17" fill="white" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${label.length > 3 ? 10 : 13}" font-weight="900">${text}</text>
    <rect x="6" y="22" width="22" height="8" rx="2" fill="#0f172a" fill-opacity=".65"/>
    <circle cx="9" cy="36" r="2" fill="white" fill-opacity=".9"/><circle cx="25" cy="36" r="2" fill="white" fill-opacity=".9"/>
    ${selected ? '<rect x="2" y="2" width="30" height="39" rx="6" fill="white" fill-opacity=".2"/>' : ''}
  </svg>`;
}
