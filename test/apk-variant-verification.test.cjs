const {test}=require('node:test');
const {execFileSync}=require('node:child_process');

test('APK verification reads package fields rather than SDK field suffixes and distinguishes different apps',()=>{
  execFileSync('python3',['-c',`
import importlib.util,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('verification','scripts/verify-apk-variants.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
line="package: name='pl.pkslive.app' versionCode='263' versionName='2.4.2' platformBuildVersionName='16' compileSdkVersion='36' compileSdkVersionCodename='16'\\nsdkVersion:'24'\\ntargetSdkVersion:'36'"
expected={'name':'pl.pkslive.app','versionCode':'263','versionName':'2.4.2','sdkVersion':'24','targetSdkVersion':'36'}
assert module.package_identity(line)==expected
assert module.package_identity(line.replace('pl.pkslive.app','another.application'))!=expected
try:
    module.package_identity("package: compileSdkVersionCodename='16' versionCode='263' versionName='2.4.2'")
except RuntimeError:
    pass
else:
    raise AssertionError('Missing application ID must be rejected')
  `],{stdio:'pipe'});
});
