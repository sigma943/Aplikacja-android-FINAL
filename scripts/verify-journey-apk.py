"""Check the actual APK's local timetable names and payloads, after aapt packaging."""
import gzip
import json
import sys
import zipfile
from pathlib import Path


def verify(apk):
    result = {}
    with zipfile.ZipFile(apk) as archive:
        for provider in ('pks', 'mpk'):
            name = f'assets/public/data/journeys/{provider}.json'
            if name not in archive.namelist():
                raise RuntimeError(f'Missing Android timetable: {name}')
            payload = archive.read(name)
            feed = json.loads(payload)
            expected = gzip.decompress(Path(f'public/data/journeys/{provider}.json.gz').read_bytes())
            if payload != expected or feed.get('version') != 1 or feed.get('provider') != provider or not feed.get('trips'):
                raise RuntimeError(f'Invalid Android timetable: {name}')
            result[provider] = {'path': name, 'trips': len(feed['trips']), 'bytes': len(payload)}
    return result


if __name__ == '__main__':
    for apk in sys.argv[1:]:
        print(json.dumps({'apk': str(apk), 'timetables': verify(apk)}))
