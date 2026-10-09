const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');

test('shared date formatter preserves calendar offsets across Warsaw midnight, DST and year boundaries',()=>{
  const {warsawDateIso}=load('lib/transit-time.ts');
  for(const instant of ['2025-12-31T23:30:00Z','2026-03-28T23:30:00Z','2026-03-29T01:30:00Z',
    '2026-10-24T22:30:00Z','2026-10-25T01:30:00Z','2026-10-09T21:59:59Z','2026-10-09T22:00:00Z']) {
    for(const offset of [-7,-1,0,1,7]) {
      const now=new Date(instant);
      const expected=new Date(`${now.toLocaleDateString('en-CA',{timeZone:'Europe/Warsaw'})}T12:00:00Z`);
      expected.setUTCDate(expected.getUTCDate()+offset);
      assert.equal(warsawDateIso(offset,now),expected.toISOString().slice(0,10));
    }
  }
});

test('preparing route timestamps does not format unused departure labels and retains timing for every provider',()=>{
  const original=load('lib/transit-time.ts');let clocks=0;
  const timing=load('lib/vehicle-stop-timing.ts',{'./transit-time':{...original,warsawClock:(ms)=>{clocks++;return original.warsawClock(ms);}}});
  const stops=[
    {id:1,planned:'2026-10-09T12:00:00+02:00',real:'2026-10-09T12:02:00+02:00'},
    {id:2,planned:'2026-10-09 12:10',real:null},
    {id:3,planned:null,real:'2026-10-09T12:20:00+02:00'},
    {id:4,planned:'invalid',real:undefined},
  ];
  for(const provider of ['pks','mpk_rzeszow','marcel','pkp_intercity']) {
    for(const status of ['active','break','inactive']) {
      for(const delay of [-180,0,180,undefined,NaN,18001]) {
        const vehicle={id:'1',provider,status,delay,routeStops:stops};
        const expected=stops.map(stop=>{
          const row=timing.vehicleStopDeparture(vehicle,stop);
          return {...stop,real:row.realAtMs!=null?new Date(row.realAtMs).toISOString():stop.real};
        });
        const before=clocks;
        assert.deepEqual(timing.timedVehicleStops(vehicle),expected);
        assert.equal(clocks,before,'route preparation must not format labels');
        assert.deepEqual(timing.timedVehicleStops({...vehicle,routeStops:[],schedule:stops}),expected);
      }
    }
  }
});

test('map ticks reuse formatters while countdowns, stop-board expiry and midnight still advance',()=>{
  const Original=Intl.DateTimeFormat;
  const originalLocale=Date.prototype.toLocaleDateString;
  let constructors=0;
  Intl.DateTimeFormat=class extends Original {constructor(...args){super(...args);constructors++;}};
  Date.prototype.toLocaleDateString=()=>{throw Error('Repeated locale formatter allocation');};
  try {
    const {mapStopDepartureRows}=load('lib/map-stop-departures.ts');
    const before=constructors;
    const midnight=Date.parse('2026-10-09T22:00:00Z');
    const row={id:'1',line:'45',direction:'Centrum',time:'00:03',carrier:{id:'mpk'},
      realAtMs:midnight+180000,realtimeSource:'stop-board',boardTimePrecisionMs:60000};
    assert.equal(mapStopDepartureRows([row],[],midnight-1)[0].day,'sobota, 10 października');
    assert.equal(mapStopDepartureRows([row],[],midnight)[0].day,'');
    assert.equal(mapStopDepartureRows([row],[],midnight)[0].time,'3 min');
    assert.equal(mapStopDepartureRows([row],[],midnight+60000)[0].time,'2 min');
    assert.equal(mapStopDepartureRows([row],[],midnight+240001).length,0);
    const atStop={...row,boardAtStop:true,boardObservedAtMs:midnight+240001};
    assert.equal(mapStopDepartureRows([atStop],[],midnight+240001).length,1);
    assert.equal(mapStopDepartureRows([atStop],[],midnight+285001).length,0);
    for(let tick=0;tick<60;tick++)mapStopDepartureRows([row],[],midnight+tick*1000);
    assert.equal(constructors,before);
  } finally {Intl.DateTimeFormat=Original;Date.prototype.toLocaleDateString=originalLocale;}
});
