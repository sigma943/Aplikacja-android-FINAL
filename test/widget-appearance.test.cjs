const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./load-ts.cjs');
const {normalizeWidgetAppearance,DEFAULT_WIDGET_APPEARANCE,widgetAccentColor,widgetSurfaceColors,widgetRgb}=loadTs('lib/widget-appearance.ts');
test('widget settings accept full transparency, bound sliders and reject invalid custom colours',()=>{
 const result=normalizeWidgetAppearance({transparency:100,cornerRadius:99,accentColor:'#Ee00AA',showStatus:false});
 assert.equal(result.transparency,100);assert.equal(result.cornerRadius,32);assert.equal(result.accentColor,'#ee00aa');assert.equal(result.showStatus,false);
 assert.equal(normalizeWidgetAppearance({transparency:NaN,cornerRadius:-5,accentColor:'red'}).transparency,20);
 assert.equal(normalizeWidgetAppearance({cornerRadius:-5}).cornerRadius,0);
 assert.equal(normalizeWidgetAppearance({accentColor:'red'}).accentColor,DEFAULT_WIDGET_APPEARANCE.accentColor);
 assert.deepEqual(normalizeWidgetAppearance(),DEFAULT_WIDGET_APPEARANCE);
});
test('custom accent colours remain readable in light and dark themes',()=>{
 const lum=color=>widgetRgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const dark of [true,false])for(const input of ['#000000','#ffffff','#eab308','#64748b','#ee00aa']){
   const accent=lum(widgetAccentColor(input,dark)),base=lum(dark?'#101e26':'#f8fafc');
   assert.ok((Math.max(accent,base)+.05)/(Math.min(accent,base)+.05)>=4.5);
 }
 assert.deepEqual(widgetSurfaceColors({...DEFAULT_WIDGET_APPEARANCE,surface:'neutral'},true),['#101e26','#101e26']);
 assert.notDeepEqual(widgetSurfaceColors(DEFAULT_WIDGET_APPEARANCE,true),widgetSurfaceColors({...DEFAULT_WIDGET_APPEARANCE,accentColor:'#ee00aa'},true));
});
test('Android pin receives normalized appearance without changing selected lines or departure timing',async()=>{
 let request;
 const {pinStopWidget}=loadTs('lib/stop-widget.ts',{'@capacitor/core':{Capacitor:{getPlatform:()=> 'android'},registerPlugin:()=>({pin:async payload=>{request=payload;return {token:'test'};}})}});
 const now=Date.now(),stop={id:'2083',name:'Test',lines:['108']};
 const row={id:'trip',line:'108',direction:'Rzeszów',time:'14:00',plannedAtMs:now+60000,realAtMs:now+120000,delayMins:1};
 await pinStopWidget({stop,lines:['108'],size:'small',theme:'dark',appearance:{transparency:65,accentColor:'#123456',showDelay:false}},[row],[]);
 const config=JSON.parse(request.config);assert.equal(config.appearance.transparency,65);assert.equal(config.appearance.showDelay,false);assert.deepEqual(config.lines,['108']);
 assert.equal(JSON.parse(request.departures)[0].realAtMs,row.realAtMs);
});
