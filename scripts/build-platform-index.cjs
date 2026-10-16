// Compile the exact runtime matcher at build time; no second set of matching rules.
const fs=require('node:fs');
const ts=require('typescript');
const {createRequire}=require('node:module');
const filename=require('node:path').resolve('lib/stop-platform-position.ts');
const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,resolveJsonModule:true,esModuleInterop:true}}).outputText;
const coordinates=ts.transpileModule(fs.readFileSync('lib/bus-coordinates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsCoordinates={};new Function('exports','require',coordinates)(exportsCoordinates,createRequire(filename));
const exportsPlatforms={};const localRequire=createRequire(filename);
new Function('exports','require',source)(exportsPlatforms,name=>name==='./bus-coordinates'?exportsCoordinates:localRequire(name));
const data=JSON.parse(fs.readFileSync('public/data/stop-platforms.json','utf8'));
fs.writeFileSync('out/data/stop-platform-index.json',JSON.stringify({version:1,index:exportsPlatforms.createPlatformIndex(data.points)}));
