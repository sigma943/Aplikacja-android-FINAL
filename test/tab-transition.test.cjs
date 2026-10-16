const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
test('tab fades skip startup and disabled/hidden views, cancel on rapid navigation and never remount content',()=>{
 const saved=global.document;global.document={hidden:false};
 let effect,cleanup,priorDeps,cursor=0,calls=0,cancels=0;
 const element={animate(frames,options){calls++;assert.deepEqual(frames,[{opacity:.45},{opacity:1}]);assert.equal(options.duration,180);return {cancel(){cancels++;}};}};
 const refs=[{current:element}];
 const {useTabTransition}=load('lib/use-tab-transition.ts',{react:{useRef:value=>refs[cursor++]||(refs[cursor-1]={current:value}),useEffect:(fn,deps)=>{if(!priorDeps||deps.some((v,i)=>v!==priorDeps[i])){cleanup?.();effect=fn;priorDeps=deps;}}}});
 const render=(tab,enabled=true)=>{cursor=0;effect=null;assert.equal(useTabTransition(tab,enabled),refs[0]);if(effect)cleanup=effect();};
 try{render('map');assert.equal(calls,0);render('stops');assert.equal(calls,1);render('admin');assert.equal(calls,2);assert.equal(cancels,1);render('admin',false);assert.equal(cancels,2);render('map',false);assert.equal(calls,2);global.document.hidden=true;render('stops');assert.equal(calls,2);global.document.hidden=false;render('map');assert.equal(calls,3);cleanup();assert.equal(cancels,3);}finally{global.document=saved;}
});
