#!/usr/bin/env python3
"""Refresh the bundled MPK model catalogue without adding runtime network requests."""
import argparse
import html
import json
import re
import urllib.request
from pathlib import Path

SOURCE = 'https://www.mpkrzeszow.pl/historia/'
ROOT = Path(__file__).resolve().parents[1]

def parse_fleet(document):
    models = {}
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', document, re.S | re.I):
        number = re.search(r'historia_pojazdu\.php\?pojazd=(\d+)', row)
        model = re.search(r'<small class="text-body-secondary">(.*?)</small>', row, re.S)
        if number and model:
            label = html.unescape(re.sub(r'<[^>]+>', '', model[1])).strip()
            if label:
                key = str(int(number[1]))
                if key in models and models[key] != label:
                    raise ValueError(f'Conflicting fleet model for {key}')
                models[key] = label
    if len(models) < 200:
        raise ValueError(f'Incomplete fleet catalogue: {len(models)} records')
    return models

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, help='Saved source HTML for reproducible offline generation')
    args = parser.parse_args()
    document = args.input.read_text() if args.input else urllib.request.urlopen(SOURCE, timeout=30).read().decode('utf-8')
    models = parse_fleet(document)
    rows = ',\n'.join('  '+json.dumps(k)+': '+json.dumps(v, ensure_ascii=False) for k, v in sorted(models.items(), key=lambda item: int(item[0])))
    source = f'''/** Public fleet catalogue: {SOURCE}. Refresh with scripts/update-mpk-fleet-models.py. */
const models: Readonly<Record<string, string>> = {{
{rows}
}};
/** Match exact fleet numbers; unknown vehicles never receive a guessed model. */
export function mpkFleetModel(vehicleNumber: string | number): string | undefined {{
  const raw = String(vehicleNumber).trim();
  return /^\\d+$/.test(raw) ? models[String(Number(raw))] : undefined;
}}
'''
    for path in ['lib/mpk-fleet-models.ts', 'functions/src/transport/mpk-fleet-models.ts']:
        (ROOT / path).write_text(source)
    print(f'Updated {len(models)} fleet models in app and backend')
