const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');

// Render the real Home, stop views and settings without the authentication gate.
// The production build and APK assets remain untouched. Requests are intercepted
// by the browser test, so no device records are created in a live Firebase project.
module.exports=function buildAccentFixture(){
  const source=process.cwd();const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'pks-ui-'));
  fs.mkdirSync(path.join(fixture,'app'));
  for(const folder of ['node_modules','components','lib','Panel'])fs.symlinkSync(path.join(source,folder),path.join(fixture,folder),'dir');
  fs.symlinkSync(path.join(source,'app/admin'),path.join(fixture,'app/admin'),'dir');
  fs.copyFileSync(path.join(source,'app/page.tsx'),path.join(fixture,'app/page.tsx'));
  fs.copyFileSync(path.join(source,'tsconfig.json'),path.join(fixture,'tsconfig.json'));
  fs.copyFileSync(path.join(source,'package.json'),path.join(fixture,'package.json'));
  fs.writeFileSync(path.join(fixture,'app/layout.tsx'),`export default function Layout({children}:{children:React.ReactNode}){return <html lang="pl"><head><link rel="stylesheet" href="/production.css" /></head><body>{children}</body></html>}`);
  fs.writeFileSync(path.join(fixture,'next.config.mjs'),`export default {output:'export',trailingSlash:true,images:{unoptimized:true},eslint:{ignoreDuringBuilds:true},typescript:{ignoreBuildErrors:true},transpilePackages:['motion']};`);
  try{
    execFileSync(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{cwd:fixture,env:{...process.env,NODE_ENV:'production'},stdio:'inherit'});
    const cssDir=path.join(source,'out/_next/static/css');
    fs.writeFileSync(path.join(fixture,'out/production.css'),fs.readdirSync(cssDir).filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync(path.join(cssDir,name),'utf8')).join('\n'));
    return {root:path.join(fixture,'out'),cleanup:()=>fs.rmSync(fixture,{recursive:true,force:true})};
  }catch(error){fs.rmSync(fixture,{recursive:true,force:true});throw error;}
};
