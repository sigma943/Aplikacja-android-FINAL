"""Derive visibility from production cutout alpha; never guess river polygons.

Run after importing terrain.webp at its registered 850 x 1850 scene coordinates.
Sky is the transparent space above each column's first opaque mountain; water
is transparent space below the documented far-bank limit. Thin tree/shore
coverage is preserved as fractional alpha. No image colour segmentation.
"""
import json
import pathlib
import numpy as np
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[1]
folder = root / 'public/themes/mountains'
terrain = Image.open(folder / 'terrain.webp').convert('RGBA')
assert terrain.size == (850, 1850)
alpha = np.asarray(terrain)[:, :, 3]
skyline = np.argmax(alpha > 160, axis=0)
assert np.all(np.any(alpha > 160, axis=0))
assert np.min(skyline) > terrain.height * .4
water = np.zeros_like(alpha)
far_bank = 1100  # Above the first river opening, below every mountain edge.
assert np.max(skyline) < far_bank
water[far_bank:] = 255 - alpha[far_bank:]
mask = np.full((1850, 850, 4), 255, dtype=np.uint8)
mask[:, :, 3] = water
Image.fromarray(mask).save(folder / 'water-mask.png', optimize=True)
samples = np.interp(np.linspace(0, 849, 256), np.arange(850), skyline) / 1850
(root / 'lib/landscape-horizon.json').write_text(json.dumps(samples.tolist(), separators=(',', ':')) + '\n')
print('Registered river pixels:', int(np.count_nonzero(water > 128)))
print('Mountain skyline:', float(samples.min()), float(samples.max()))
