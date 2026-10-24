const fs=require('fs'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),puppeteer=require('puppeteer'),load=require('./load-ts.cjs');
const stop=(id,name)=>({id,name,type:'bus',carriers:[],lines:[],isFavorite:false});
global.localStorage={getItem:()=>JSON.stringify([{from:stop('a','Rzeszów D.A.'),to:stop('b','Albigowa I 21 nż')},{from:stop('c','Twoja lokalizacja'),to:stop('d','Krosno – ul. Żółkiewskiego MPGK 03')}])};
const Planner=load('components/journeys/JourneyPlanner.tsx',{'./journeys.css':{},'next/dynamic':()=>()=>null,'@/lib/journey-catalog':{},'@/lib/journey-loader':{},'@/Panel/src/components/StopList':()=>null}).default;
const markup=renderToStaticMarkup(React.createElement(Planner,{stops:[],dark:true,active:true,onClose(){}}));
(async()=>{const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.setViewport({width:393,height:851,deviceScaleFactor:1});
 const css=fs.readFileSync('app/globals.css','utf8').replace(/^@import[^;]+;/gm,'')+'\n'+fs.readFileSync('components/journeys/journeys.css','utf8');
 const image='data:image/jpeg;base64,'+fs.readFileSync('public/themes/kosmos/nebula.jpg').toString('base64');
 await page.setContent('<html data-cosmic-theme="on"><head><style>'+css+'</style></head><body><div class="pks-theme-root" data-ui-theme="dark-cosmos" style="position:relative;height:100vh;background-image:url('+image+')">'+markup+'</div></body></html>');
 await page.$eval('.connections-recents',e=>e.scrollIntoView());
 const styles=await page.evaluate(()=>{const read=s=>{const e=document.querySelector(s),c=getComputedStyle(e);return {bg:c.backgroundColor,image:c.backgroundImage,blur:c.backdropFilter,radius:c.borderRadius,padding:c.padding,overflow:e.scrollWidth>e.clientWidth};};return {recent:read('.connections-recents'),form:read('.connections-form'),result:read('.connections-card')};});
 assert.equal(styles.recent.bg,styles.form.bg);assert.notEqual(styles.recent.bg,'rgba(0, 0, 0, 0)');assert.equal(styles.recent.image,styles.form.image);assert.equal(styles.recent.blur,styles.form.blur);assert.equal(styles.recent.overflow,false);
 fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/journeys-recents-panel.png'});console.log(styles);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
