const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');

// Render the real Home, stop views and settings without the authentication gate.
// The production build and APK assets remain untouched. Requests are intercepted
// by the browser test, so no device records are created in a live Firebase project.
module.exports=function buildAccentFixture(){
  const source=process.cwd();const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'pks-ui-'));
  fs.mkdirSync(path.join(fixture,'app'));
  for(const folder of ['node_modules','components','lib','Panel','public'])fs.symlinkSync(path.join(source,folder),path.join(fixture,folder),'dir');
  fs.symlinkSync(path.join(source,'app/admin'),path.join(fixture,'app/admin'),'dir');
  fs.copyFileSync(path.join(source,'app/page.tsx'),path.join(fixture,'app/page.tsx'));
  fs.mkdirSync(path.join(fixture,'app/maintenance'));
  const maintenance=fs.readFileSync(path.join(source,'app/admin/components/MaintenanceView.tsx'),'utf8')
    .replaceAll("from '@/lib/maintenance-spark'", "from './sdk'")
    .replaceAll("from 'firebase/firestore'", "from './sdk'")
    .replaceAll("from '@/lib/firebase'", "from './sdk'")
    .replaceAll("from '../types'", "from '@/app/admin/types'")
    .replaceAll("from './AdminModalPortal'", "from '@/app/admin/components/AdminModalPortal'");
  fs.writeFileSync(path.join(fixture,'app/maintenance/Component.tsx'),maintenance);
  fs.copyFileSync(path.join(source,'test/maintenance-ui-stub.ts'),path.join(fixture,'app/maintenance/sdk.ts'));
  fs.writeFileSync(path.join(fixture,'app/maintenance/page.tsx'),`'use client';import {MaintenanceView} from './Component';export default function Page(){return <MaintenanceView onMenuClick={()=>{}} canEdit={true}/>}`);
  fs.mkdirSync(path.join(fixture,'app/dialog-fixture'));
  fs.writeFileSync(path.join(fixture,'app/dialog-fixture/page.tsx'),`'use client';import {useState} from 'react';import {RolesModal} from '@/app/admin/components/RolesModal';import {BanModal} from '@/app/admin/components/BanModal';
  export default function Page(){const [open,setOpen]=useState('roles');const device:any={id:'test-device',name:'Windows 19.0.0',deviceInfo:'Windows 19.0.0',rawRole:'admin',role:'Administrator',verified:true,permissions:{monitor:true}};return <div className="pks-theme-root"><div className="pks-panel-scope" data-panel-theme="amoled" data-glass="on" style={{transform:'translateX(0)',height:200,overflow:'hidden'}}><button onClick={()=>setOpen('roles')}>Role</button><button onClick={()=>setOpen('ban')}>Ban</button>{open==='roles'&&<RolesModal device={device} onClose={()=>setOpen('')} onUpdateUser={()=>{}} onSave={()=>setOpen('')} canAssignOwner canManageTabAccess canManageVerification/>}{open==='ban'&&<BanModal device={device} onClose={()=>setOpen('')} onConfirm={()=>setOpen('')}/>}</div><nav id="fixture-nav" style={{position:'fixed',bottom:0,height:80,width:'100%',background:'black',zIndex:11000}}>Navigation</nav></div>}`);
  fs.copyFileSync(path.join(source,'tsconfig.json'),path.join(fixture,'tsconfig.json'));
  fs.copyFileSync(path.join(source,'package.json'),path.join(fixture,'package.json'));
  fs.writeFileSync(path.join(fixture,'app/layout.tsx'),`import UIMotionProvider from '@/components/UIMotionProvider';export default function Layout({children}:{children:React.ReactNode}){return <html lang="pl"><head><link rel="stylesheet" href="/production.css" /></head><body><UIMotionProvider>{children}</UIMotionProvider></body></html>}`);
  fs.writeFileSync(path.join(fixture,'next.config.mjs'),`export default {output:'export',trailingSlash:true,images:{unoptimized:true},eslint:{ignoreDuringBuilds:true},typescript:{ignoreBuildErrors:true},transpilePackages:['motion']};`);
  try{
    execFileSync(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{cwd:fixture,env:{...process.env,NODE_ENV:'production'},stdio:'inherit'});
    const cssDir=path.join(source,'out/_next/static/css');
    fs.writeFileSync(path.join(fixture,'out/production.css'),fs.readdirSync(cssDir).filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync(path.join(cssDir,name),'utf8')).join('\n'));
    return {root:path.join(fixture,'out'),cleanup:()=>fs.rmSync(fixture,{recursive:true,force:true})};
  }catch(error){fs.rmSync(fixture,{recursive:true,force:true});throw error;}
};
