"""Restore the persistent APK key; never fall back to a runner-generated key."""
import base64
import os
import subprocess
import sys
from pathlib import Path


def restore(environment):
    names = ('APK_KEYSTORE_BASE64', 'APK_STORE_PASSWORD', 'APK_KEY_ALIAS', 'APK_KEY_PASSWORD')
    missing = [name for name in names if not environment.get(name)]
    if missing:
        raise ValueError('Persistent APK signing is required. Configure ANDROID_KEYSTORE_BASE64, '
                         'ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD '
                         'in GitHub Actions secrets. See docs/persistent-device-access.md.')
    for name in names[1:]:
        if '\n' in environment[name] or '\r' in environment[name]:
            raise ValueError('Signing configuration must use single-line values')
    try:
        key = base64.b64decode(''.join(environment['APK_KEYSTORE_BASE64'].split()), validate=True)
    except ValueError:
        raise ValueError('ANDROID_KEYSTORE_BASE64 is not valid Base64') from None
    if not key:
        raise ValueError('Signing keystore is empty')
    path = Path(environment['RUNNER_TEMP']) / 'pks-live-signing.keystore'
    # Create the file with private permissions before writing any key bytes.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        os.chmod(path, 0o600)
        output.write(key)
    try:
        checked = subprocess.run(
            ['keytool', '-J-Duser.language=en', '-J-Duser.country=US', '-list',
             '-alias', environment['APK_KEY_ALIAS'], '-keystore', str(path),
             '-storepass:env', 'APK_STORE_PASSWORD'],
            env=dict(environment), capture_output=True, text=True)
        if checked.returncode != 0 or 'PrivateKeyEntry' not in checked.stdout:
            raise ValueError('Signing keystore, store password or private-key alias is invalid')
        with open(environment['GITHUB_ENV'], 'a') as output:
            output.write(f'APK_SIGNING_STORE_FILE={path}\n')
            for source, target in (
                ('APK_STORE_PASSWORD', 'APK_SIGNING_STORE_PASSWORD'),
                ('APK_KEY_ALIAS', 'APK_SIGNING_KEY_ALIAS'),
                ('APK_KEY_PASSWORD', 'APK_SIGNING_KEY_PASSWORD'),
            ):
                output.write(f'{target}={environment[source]}\n')
    except Exception:
        path.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    try:
        restore(os.environ)
    except (ValueError, OSError) as error:
        print(f'::error::{error}', file=sys.stderr)
        sys.exit(1)
