const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cachedStopText}=require('./load-ts.cjs')('lib/stop-text-cache.ts');

test('text cache reuses immutable results, including empty strings, without mixing keys',()=>{
  let calls=0;const cached=cachedStopText(text=>{calls++;return text==='empty'?'':text.toLowerCase();});
  assert.equal(cached('Rzeszów'),'rzeszów');assert.equal(cached('Rzeszów'),'rzeszów');
  assert.equal(cached('empty'),'');assert.equal(cached('empty'),'');assert.equal(calls,2);
  assert.equal(cached('Rzeszów 03'),'rzeszów 03');assert.equal(cached('Rzeszów 04'),'rzeszów 04');
});

test('large text is not retained and old keys are evicted when the cache fills',()=>{
  let calls=0;const cached=cachedStopText(text=>{calls++;return text;});
  const large='x'.repeat(513);cached(large);cached(large);assert.equal(calls,2);
  cached('old');for(let i=0;i<8192;i++)cached(String(i));
  const before=calls;cached('8191');assert.equal(calls,before);
  cached('old');assert.equal(calls,before+1,'oldest entry is no longer retained');
});

test('large transformed values are not retained either',()=>{
  let calls=0;const cached=cachedStopText(text=>{calls++;return text.repeat(513);});
  assert.equal(cached('a').length,513);cached('a');assert.equal(calls,2);
});
