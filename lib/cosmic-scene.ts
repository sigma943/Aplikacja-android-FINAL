const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

export function cosmicRandom(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Painted once: wisps, dark dust lanes and tiny stars, without filters or images. */
function dust(seed: number) {
  const random = cosmicRandom(seed);
  const band = (x: number) => 292 - x * .31 + Math.sin(x / 95) * 22;
  const wisps = Array.from({length: 14}, (_, i) => {
    const x = 28 + i * 45, y = band(x);
    return `<ellipse cx="${x}" cy="${y.toFixed(1)}" rx="${(60 + random() * 48).toFixed(1)}" ry="${(12 + random() * 24).toFixed(1)}" transform="rotate(-24 ${x} ${y.toFixed(1)})" fill="url(#${i % 3 ? 'nebula' : 'mist'})" opacity="${(.35 + random() * .5).toFixed(2)}"/>`;
  }).join('');
  const stars = Array.from({length: 110}, () => {
    const x = random() * 640, y = random() * 400;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.25 + random() * .65).toFixed(2)}" opacity="${(.14 + random() * .5).toFixed(2)}"/>`;
  }).join('');
  const grains = Array.from({length: 96}, (_, i) => {
    const x = 15 + random() * 610, y = band(x) + (random() - .5) * (18 + random() * 64);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.2 + random() * .55).toFixed(2)}" fill="${i % 9 ? '#a99cde' : '#c6dfff'}" opacity="${(.15 + random() * .32).toFixed(2)}"/>`;
  }).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><radialGradient id="nebula"><stop stop-color="#8c6acd" stop-opacity=".25"/><stop offset=".4" stop-color="#57428b" stop-opacity=".12"/><stop offset="1" stop-color="#15122c" stop-opacity="0"/></radialGradient><radialGradient id="mist"><stop stop-color="#5e9dc6" stop-opacity=".22"/><stop offset=".42" stop-color="#324a87" stop-opacity=".1"/><stop offset="1" stop-color="#0b172c" stop-opacity="0"/></radialGradient><radialGradient id="spark"><stop stop-color="#d7e9ff" stop-opacity=".5"/><stop offset=".15" stop-color="#89b5ed" stop-opacity=".18"/><stop offset="1" stop-color="#89b5ed" stop-opacity="0"/></radialGradient></defs>${wisps}<path d="M0 295Q150 217 295 231T640 87" fill="none" stroke="#02040a" stroke-width="12" opacity=".55"/><path d="M52 320Q212 216 367 210T618 116" fill="none" stroke="#02040a" stroke-width="5" opacity=".4"/><g fill="#c5d7f4">${stars}</g>${grains}<g fill="url(#spark)"><circle cx="94" cy="256" r="12"/><circle cx="526" cy="136" r="9"/></g><g stroke="#d6e7ff" stroke-width=".6" opacity=".65"><path d="M94 252v8m-4-4h8M526 133v6m-3-3h6"/></g><circle cx="94" cy="256" r=".9" fill="#ecf4ff"/><circle cx="526" cy="136" r=".7" fill="#f4cfac"/></svg>`);
}
export const COSMIC_DUST = [dust(731), dust(1929), dust(4491), dust(8764)];

function planet(seed: number, light: string, middle: string, dark: string, detail: string, ring = false) {
  const random = cosmicRandom(seed);
  const texture = Array.from({length: 72}, (_, i) => {
    const x = 22 + random() * 84, y = 22 + random() * 84;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.3 + random() * 1.4).toFixed(1)}" fill="${i % 3 ? light : dark}" opacity="${(.04 + random() * .14).toFixed(2)}"/>`;
  }).join('');
  const rings = `<g transform="rotate(-24 64 64)" fill="none"><ellipse cx="64" cy="64" rx="60" ry="16" stroke="${light}" stroke-width="4" opacity=".28"/><ellipse cx="64" cy="64" rx="54" ry="13" stroke="${middle}" stroke-width="2" opacity=".55"/><ellipse cx="64" cy="64" rx="62" ry="18" stroke="${light}" stroke-width=".7" opacity=".23"/></g>`;
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><radialGradient id="surface" cx="23%" cy="22%" r="85%"><stop stop-color="${light}"/><stop offset=".3" stop-color="${middle}"/><stop offset=".8" stop-color="${dark}"/><stop offset="1" stop-color="#02030a"/></radialGradient><radialGradient id="night" cx="7%" cy="20%" r="100%"><stop stop-color="#02030a" stop-opacity="0"/><stop offset=".42" stop-color="#02030a" stop-opacity=".08"/><stop offset=".7" stop-color="#02030a" stop-opacity=".68"/><stop offset="1" stop-color="#02030a" stop-opacity=".98"/></radialGradient><radialGradient id="air"><stop offset=".86" stop-color="${light}" stop-opacity="0"/><stop offset=".95" stop-color="${light}" stop-opacity=".13"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient><clipPath id="disc"><circle cx="64" cy="64" r="41"/></clipPath><clipPath id="front"><path d="M0 64H128V128H0Z" transform="rotate(-24 64 64)"/></clipPath></defs>${ring ? rings : ''}<circle cx="64" cy="64" r="45" fill="url(#air)"/><circle cx="64" cy="64" r="41" fill="url(#surface)"/><g clip-path="url(#disc)">${detail}${texture}<circle cx="64" cy="64" r="41" fill="url(#night)"/></g><path d="M26 48A41 41 0 0 1 73 24" fill="none" stroke="${light}" stroke-width=".8" opacity=".58"/>${ring ? `<g clip-path="url(#front)">${rings}</g>` : ''}</svg>`);
}
export const COSMIC_PLANETS = [
  planet(11, '#b7d9ff', '#345787', '#080e24', '<path d="M24 42Q46 23 63 37L57 49 77 54 84 70 65 79 55 100 37 85 43 67 27 61Z" fill="#89adc0" opacity=".28"/><path d="M24 45Q44 36 63 43T104 50M21 74Q43 61 65 72T105 81" fill="none" stroke="#d7e7ff" stroke-width="2" opacity=".18"/>'),
  planet(23, '#eac2a2', '#955b52', '#1c101c', '<g fill="#482737" opacity=".5"><path d="M28 42L49 28 56 43 72 41 89 64 66 74 49 100 30 81 42 62Z"/><circle cx="76" cy="82" r="8"/></g><path d="M30 44Q48 31 65 42M28 80Q51 73 67 85" fill="none" stroke="#f1c3a0" stroke-width="1.2" opacity=".3"/>'),
  planet(37, '#cdc9f4', '#6b659a', '#110e29', '<path d="M20 42Q62 60 108 43M19 55Q65 72 109 58M22 76Q61 89 105 78M31 91Q66 98 97 94" fill="none" stroke="#b9acd9" stroke-width="4" opacity=".25"/>', true),
  planet(41, '#a8dce0', '#386878', '#07161e', '<path d="M22 44Q44 32 65 47T105 52M21 61Q51 50 78 66T108 70M28 82Q57 72 101 89" fill="none" stroke="#83b6c9" stroke-width="5" opacity=".28"/>'),
  planet(53, '#edcfac', '#a87e6c', '#211620', '<path d="M22 38Q61 52 106 42M21 54Q65 67 107 55M22 71Q64 85 104 75M32 90Q65 101 96 93" fill="none" stroke="#e5bb9c" stroke-width="5" opacity=".32"/><ellipse cx="78" cy="74" rx="10" ry="5" fill="#844e4e" opacity=".5"/>'),
  planet(67, '#ccd6ea', '#67748e', '#111725', '<g fill="#29344d" stroke="#b6c5d8" stroke-width=".7" stroke-opacity=".23"><circle cx="44" cy="46" r="8"/><circle cx="72" cy="36" r="5"/><circle cx="57" cy="79" r="11"/><circle cx="87" cy="68" r="6"/><circle cx="36" cy="72" r="3"/></g>'),
];

export function cosmicScene(seed: number, previous?: {x: number; planet: number}) {
  const r = cosmicRandom(seed);
  const scene = {
    planet: Math.floor(r() * COSMIC_PLANETS.length), showPlanet: r() > .68,
    x: (r() < .5 ? 48 : 80) + r() * 10, y: 64 + r() * 24, size: 50 + r() * 26,
    dust: Math.floor(r() * COSMIC_DUST.length), dustX: -Math.floor(r() * 640), dustY: -Math.floor(r() * 400),
  };
  if (previous) {
    // Alternate the lower middle and outer edge, away from titles and favourite icons.
    if (Math.abs(scene.x - previous.x) < 22) scene.x = previous.x > 69 ? 48 + r() * 10 : 80 + r() * 10;
    if (scene.planet === previous.planet) scene.planet = (scene.planet + 1 + Math.floor(r() * (COSMIC_PLANETS.length - 1))) % COSMIC_PLANETS.length;
  }
  return scene;
}

/** At least two quiet cards between planets; no long empty run in a stop list. */
export function cosmicListScene(seed: number, previous?: ReturnType<typeof cosmicScene>, gap = 2) {
  const scene = cosmicScene(seed, previous);
  scene.showPlanet = gap >= 2 && (scene.showPlanet || gap >= 4);
  return scene;
}

export const COSMIC_PANEL_SELECTOR = '.pks-map-search-panel,.map-detail-shell,.pks-options-sheet,[data-carrier-sheet],.transit-surface,.transit-card,.admin-topbar,.pks-personal-card,.pks-option-card,.widget-generator';
