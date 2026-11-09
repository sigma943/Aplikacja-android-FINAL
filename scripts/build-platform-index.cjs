// Compile the exact runtime matcher at build time; no second set of matching rules.
const fs=require('node:fs');
const ts=require('typescript');
const {createRequire}=require('node:module');
const filename=require('node:path').resolve('lib/stop-platform-position.ts');
const localRequire=createRequire(filename);
function loadTypeScript(file,requireModule){
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,resolveJsonModule:true,esModuleInterop:true}}).outputText;
  const output={};
  new Function('exports','require',source)(output,requireModule);
  return output;
}
const dependencies=Object.fromEntries(['bus-coordinates','stop-label'].map(name=>['./'+name,loadTypeScript('lib/'+name+'.ts',localRequire)]));
const {createPlatformIndex}=loadTypeScript(filename,name=>dependencies[name]??localRequire(name));
const data=JSON.parse(fs.readFileSync('public/data/stop-platforms.json','utf8'));
fs.writeFileSync('out/data/stop-platform-index.json',JSON.stringify({version:1,index:createPlatformIndex(data.points)}));
