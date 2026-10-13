import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Retain the NASA source images. SVG composition provides feathered edges and
// restrained opacity without filters or blended WebView layers at runtime.
const root = new URL('../public/themes/kosmos/', import.meta.url);
const photo = name => `data:image/png;base64,${readFileSync(new URL(name, root)).toString('base64')}`;
const nebula = photo('orion.png');
const galaxy = photo('sombrero.png');
for (let i = 0; i < 4; i++) {
  const x = [280, 340, 230, 310][i], y = [160, 205, 180, 140][i];
  const galaxyArt = i === 1 ? `<g transform="translate(385 252) rotate(-22)"><image x="-42" y="-20" width="84" height="40" href="${galaxy}" mask="url(#galaxy-edge)" opacity=".58"/></g>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><defs><radialGradient id="fade"><stop stop-color="white"/><stop offset=".45" stop-color="white" stop-opacity=".7"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><mask id="cloud-edge"><ellipse cx="${x}" cy="${y}" rx="175" ry="125" fill="url(#fade)"/></mask><mask id="galaxy-edge"><ellipse cx="0" cy="0" rx="42" ry="20" fill="url(#fade)"/></mask></defs><image x="${x - 190}" y="${y - 140}" width="380" height="280" preserveAspectRatio="xMidYMid slice" href="${nebula}" mask="url(#cloud-edge)" opacity="${[.10, .07, .12, .08][i]}"/>${galaxyArt}</svg>`;
  writeFileSync(fileURLToPath(new URL(`deep-space-${i}.svg`, root)), svg + '\n');
}
