const {test}=require('node:test');
const {execFileSync}=require('node:child_process');

test('APK signing rejects missing or invalid keys and preserves the configured key across builds',()=>{
  execFileSync('python3',['test/apk-signing.py'],{stdio:'pipe'});
});
