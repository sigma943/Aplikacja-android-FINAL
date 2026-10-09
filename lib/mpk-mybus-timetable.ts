import {warsawDateIso, warsawTimeMs} from './transit-time';

export type MybusStop = {id: number; name: string; planned: string | null; real: string | null};
function attributes(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value]) => [key,
    value.replace(/&#(x[\da-f]+|\d+);/gi, (_,code) => String.fromCodePoint(code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code)))
      .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'),
  ]));
}
/** myBus supplies arrival estimates, not planned times: never manufacture a delay. */
export function parseMybusTimetable(xml: string, now: number, expectedLine?: string): MybusStop[] {
  const root = /<Schedules\b([^>]*)>/i.exec(xml);
  if (!root) throw new Error('Invalid myBus vehicle timetable');
  const header = attributes(root[1]);
  if (expectedLine && header.nr?.trim() && header.nr.trim() !== expectedLine.trim()) return [];
  const date = warsawDateIso(0, new Date(now));
  return [...xml.matchAll(/<Stop\b([^>]*?)\/?\s*>/gi)].flatMap(match => {
    const stop = attributes(match[1]);
    const id = Number(stop.id), name = stop.name?.trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return [];
    let planned: string | null = null, real: string | null = null;
    const seconds = stop.s?.trim() ? Number(stop.s) : NaN;
    if (stop.th?.trim() && /^\d{1,2}$/.test(stop.th) && /^\d{1,2}$/.test(stop.tm || '')) {
      let time = warsawTimeMs(date, `${stop.th.padStart(2,'0')}:${stop.tm.padStart(2,'0')}`);
      if (time < now - 12 * 3600_000) time = warsawTimeMs(warsawDateIso(1,new Date(now)),`${stop.th.padStart(2,'0')}:${stop.tm.padStart(2,'0')}`);
      if (Number.isFinite(time)) planned = new Date(time).toISOString();
    }
    if ((stop.m === '1' || stop.m === '2') && Number.isFinite(seconds) && seconds >= 0 && seconds <= 48 * 3600) {
      real = new Date(now + seconds * 1000).toISOString();
    }
    return [{id,name,planned,real}];
  });
}
