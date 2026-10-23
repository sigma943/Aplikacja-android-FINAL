const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
function surface(fields){
 const cleanups=[],listeners=new Map(),doc={activeElement:null,addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:(event)=>listeners.delete(event)};
 const element=(tag)=>({tag,isConnected:true,getClientRects:()=>[{}],matches:()=>['input','textarea','select','contenteditable'].includes(tag),focus(){doc.activeElement=this;}});
 const opener=element('button');doc.activeElement=opener;
 const nodes=fields.map(element),attrs=new Map(),root={...element('div'),querySelectorAll:()=>nodes,contains:n=>n===root||nodes.includes(n),getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
 const {useDialogFocus}=load('lib/use-dialog-focus.ts',{react:{useRef:current=>({current}),useEffect:callback=>{const cleanup=callback();if(cleanup)cleanups.push(cleanup);}}});
 return {doc,root,nodes,opener,open(onClose=()=>{}){const previous=global.document;global.document=doc;try{useDialogFocus({current:root},true,onClose);}finally{global.document=previous;}},key(key,shiftKey=false){const previous=global.document;global.document=doc;try{let prevented=false;listeners.get('keydown')?.({key,shiftKey,preventDefault(){prevented=true;},stopPropagation(){}});return prevented;}finally{global.document=previous;}},close(){const previous=global.document;global.document=doc;try{cleanups.reverse().forEach(fn=>fn());}finally{global.document=previous;}}};
}
test('opening a picker skips text input; explicit Tab still includes it and Escape restores the opener',()=>{
 const ui=surface(['input','button','textarea']);let closed=false;ui.open(()=>closed=true);
 try{
  assert.equal(ui.doc.activeElement,ui.nodes[1]);
  ui.doc.activeElement=ui.nodes[2];assert.equal(ui.key('Tab'),true);assert.equal(ui.doc.activeElement,ui.nodes[0]);
  assert.equal(ui.key('Tab',true),true);assert.equal(ui.doc.activeElement,ui.nodes[2]);
  ui.key('Escape');assert.equal(closed,true);
 }finally{ui.close();}
 assert.equal(ui.doc.activeElement,ui.opener);
});
test('an input-only surface focuses its container, without changing the tab order permanently',()=>{
 const ui=surface(['input']);ui.open();
 assert.equal(ui.doc.activeElement,ui.root);assert.equal(ui.root.getAttribute('tabindex'),'-1');
 ui.close();assert.equal(ui.root.getAttribute('tabindex'),null);assert.equal(ui.doc.activeElement,ui.opener);
});
