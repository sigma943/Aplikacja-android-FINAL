import base64
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('signing', 'scripts/restore-apk-signing.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class SigningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.key = Path(cls.directory.name) / 'test.p12'
        subprocess.run(['keytool', '-genkeypair', '-keystore', str(cls.key),
                        '-storetype', 'PKCS12', '-storepass', 'test-only-password',
                        '-keypass', 'test-only-password', '-alias', 'test-signing',
                        '-keyalg', 'RSA', '-validity', '1', '-dname', 'CN=Temporary CI Test'],
                       check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def environment(self, directory):
        return {**os.environ, 'RUNNER_TEMP': directory, 'GITHUB_ENV': str(Path(directory) / 'env'),
                'APK_KEYSTORE_BASE64': base64.b64encode(self.key.read_bytes()).decode(),
                'APK_STORE_PASSWORD': 'test-only-password', 'APK_KEY_ALIAS': 'test-signing',
                'APK_KEY_PASSWORD': 'test-only-password'}

    def test_each_missing_secret_blocks_build(self):
        for name in ('APK_KEYSTORE_BASE64', 'APK_STORE_PASSWORD', 'APK_KEY_ALIAS', 'APK_KEY_PASSWORD'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                environment = self.environment(directory)
                environment[name] = ''
                with self.assertRaisesRegex(ValueError, 'Persistent APK signing is required'):
                    signing.restore(environment)
                self.assertFalse((Path(directory) / 'env').exists())
                self.assertFalse((Path(directory) / 'pks-live-signing.keystore').exists())

    def test_invalid_configuration_never_exports_signing(self):
        for name, value in [('APK_KEYSTORE_BASE64', 'invalid!'),
                            ('APK_KEYSTORE_BASE64', '   '),
                            ('APK_KEY_ALIAS', 'missing-alias'),
                            ('APK_STORE_PASSWORD', 'wrong-password'),
                            ('APK_KEY_PASSWORD', 'password\nINJECTED=value')]:
            with self.subTest(name=name, value=value), tempfile.TemporaryDirectory() as directory:
                environment = self.environment(directory)
                environment[name] = value
                with self.assertRaises(ValueError):
                    signing.restore(environment)
                self.assertFalse((Path(directory) / 'env').exists())
                self.assertFalse((Path(directory) / 'pks-live-signing.keystore').exists())

    def test_fresh_runners_restore_identical_key(self):
        for _ in range(2):
            with tempfile.TemporaryDirectory() as directory:
                environment = self.environment(directory)
                signing.restore(environment)
                key = Path(directory) / 'pks-live-signing.keystore'
                self.assertEqual(key.read_bytes(), self.key.read_bytes())
                self.assertEqual(stat.S_IMODE(key.stat().st_mode), 0o600)
                exported = dict(line.split('=', 1) for line in (Path(directory) / 'env').read_text().splitlines())
                self.assertEqual(exported['APK_SIGNING_STORE_FILE'], str(key))
                self.assertEqual(exported['APK_SIGNING_KEY_ALIAS'], environment['APK_KEY_ALIAS'])
                self.assertEqual(exported['APK_SIGNING_STORE_PASSWORD'], environment['APK_STORE_PASSWORD'])
                self.assertEqual(exported['APK_SIGNING_KEY_PASSWORD'], environment['APK_KEY_PASSWORD'])


if __name__ == '__main__':
    unittest.main()
