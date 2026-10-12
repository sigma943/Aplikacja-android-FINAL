"""Verify signed debug/release APK identity and unchanged packaged web content."""
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path


def output(*command):
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT)


def inspect(apk, aapt, apksigner):
    badging = output(aapt, 'dump', 'badging', apk)
    package_line = next(line for line in badging.splitlines() if line.startswith('package:'))
    identity = dict(re.findall(r"(name|versionCode|versionName)='([^']*)'", package_line))
    for field in ('sdkVersion', 'targetSdkVersion'):
        match = re.search(r"^" + field + r":'([^']*)'", badging, re.MULTILINE)
        identity[field] = match.group(1) if match else None
    manifest = output(aapt, 'dump', 'xmltree', apk, 'AndroidManifest.xml')
    flag = re.search(r'android:debuggable[^\n]*\(type 0x12\)(0x[0-9a-fA-F]+)', manifest)
    debuggable = bool(flag and int(flag.group(1), 16))
    verification = output(apksigner, 'verify', '--print-certs', apk)
    certificates = sorted(re.findall(r'^Signer #\d+ certificate SHA-256 digest: (.+)$', verification, re.MULTILINE))
    if not certificates:
        raise RuntimeError('APK does not have a verified signing certificate')
    with zipfile.ZipFile(apk) as archive:
        assets = {name: hashlib.sha256(archive.read(name)).hexdigest()
                  for name in archive.namelist() if name.startswith('assets/') and not name.endswith('/')}
    if 'assets/public/index.html' not in assets:
        raise RuntimeError('Packaged application entry point is missing')
    return {'identity': identity, 'debuggable': debuggable, 'certificates': certificates, 'assets': assets}


def main():
    debug, release, aapt, apksigner, destination = sys.argv[1:]
    first, second = inspect(debug, aapt, apksigner), inspect(release, aapt, apksigner)
    if first['identity'] != second['identity']:
        raise RuntimeError('Package, version or supported Android versions differ')
    if not first['debuggable'] or second['debuggable']:
        raise RuntimeError('Expected debug to be debuggable and release to be non-debuggable')
    if first['certificates'] != second['certificates']:
        raise RuntimeError('Debug/release signing certificates differ: do not publish this release')
    if first['assets'] != second['assets']:
        raise RuntimeError('Packaged web application or Capacitor configuration differs')
    report = {'identity': second['identity'], 'releaseDebuggable': second['debuggable'],
              'signingCertificateSha256': second['certificates'], 'identicalAssetFiles': len(second['assets']),
              'debugBytes': Path(debug).stat().st_size, 'releaseBytes': Path(release).stat().st_size,
              'phoneStartupMeasured': False}
    Path(destination).write_text(json.dumps(report, indent=2) + '\n')
    print('APK_VARIANT_VERIFICATION=' + json.dumps(report))


if __name__ == '__main__':
    main()
