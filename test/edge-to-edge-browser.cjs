const assert=require('node:assert/strict'),fs=require('node:fs'),puppeteer=require('puppeteer');
(async()=>{
 const css=fs.readdirSync('out/_next/static/css').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('out/_next/static/css/'+n)).join('\n');
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  for(const [width,height,insets] of [[393,851,{top:32,bottom:24,left:0,right:0}],[851,393,{top:24,bottom:0,left:32,right:48}],[1366,900,{top:0,bottom:0,left:0,right:0}]]){
   await page.setViewport({width,height});
   await page.setContent('<style>'+css+'</style><div class="pks-theme-root fixed inset-0 flex flex-col"><div data-app-content class="flex-1 relative min-h-0"><div data-map-canvas class="absolute inset-0"><div data-map-toolbar class="absolute top-0 left-0 right-0 p-2"><button>PKS Live</button></div></div><div data-test-content class="absolute inset-0" hidden></div></div><div data-app-navigation class="absolute bottom-0 left-0 right-0"><div class="pks-navigation" style="height:calc(64px + var(--safe-bottom));padding-bottom:var(--safe-bottom)"><button>Mapa</button></div></div></div>');
   await page.evaluate(insets=>{const r=document.documentElement;r.dataset.nativeEdge='true';for(const [side,value]of Object.entries(insets))r.style.setProperty('--native-'+side,value+'px');},insets);
   const metrics=await page.evaluate(()=>{const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};return {map:rect('[data-map-canvas]'),toolbar:rect('[data-map-toolbar]'),content:rect('[data-app-content]'),nav:rect('[data-app-navigation]'),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(metrics.map.top,0);assert.equal(metrics.map.left,0);assert.equal(metrics.map.bottom,height);assert.equal(metrics.map.right,width);
   assert.equal(metrics.content.top,insets.top);assert.equal(metrics.content.left,insets.left);
   assert.ok(metrics.toolbar.top>=insets.top);assert.ok(metrics.toolbar.left>=insets.left);
   assert.equal(metrics.nav.bottom,height);assert.equal(metrics.overflow,false);
  }
  await browser.close();console.log('PASS edge-to-edge full map, safe header/content/navigation, portrait/landscape/desktop');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
