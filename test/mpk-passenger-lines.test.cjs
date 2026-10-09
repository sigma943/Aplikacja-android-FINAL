const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {isMpkPassengerLine,mpkPassengerStop}=load('lib/mpk-passenger-lines.ts');
const {mpkBoardEntries}=load('lib/mpk-departures.ts');
const {parseMybusDepartures}=load('lib/mpk-mybus-departures.ts');

test('MPK technical labels disappear without rejecting night and lettered passenger lines',()=>{
  for(const line of ['Doj','PTech','Zj',' DOJ ','ptech','zJ','',null]) assert.equal(isMpkPassengerLine(line),false);
  for(const line of ['2','27','47','N1','N3','0A','0B','A','108']) assert.equal(isMpkPassengerLine(line),true);
  const original={id:'768',lines:['2','27','47','Doj','PTech','Zj']};
  assert.deepEqual(mpkPassengerStop(original).lines,['2','27','47']);
  assert.equal(original.lines.length,6,'cached source is not mutated');
});

test('both primary and myBus stop boards hide technical journeys',()=>{
  const lines=['Doj','PTech','Zj','2','N1','0A'];
  const primary=lines.map(linia=>({linia,kierunek:'Centrum',czas_odjazdu:'17:00'}));
  assert.deepEqual(Array.from(mpkBoardEntries(primary),r=>r.line),['2','N1','0A']);
  const xml='<Departures i="768">'+lines.map((r,i)=>`<D i="${i}" r="${r}" d="Centrum" t="600" vr="600" m="2"/>`).join('')+'</Departures>';
  assert.deepEqual(Array.from(parseMybusDepartures(xml,'768',Date.parse('2026-10-09T14:00:00Z')),r=>r.line),['2','N1','0A']);
});
