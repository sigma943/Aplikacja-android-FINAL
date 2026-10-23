import type {Stop} from '@/Panel/src/types';
import {displayStopCatalogLabel} from './stop-label';
import {STOP_SEARCH_ALIASES} from './stop-search-aliases';

const ABBREVIATIONS=['da','pks','pkp','skr','osp','psk','sp','mpgk','uw'];
const ABBREVIATION_PATTERNS=ABBREVIATIONS.map(word=>[new RegExp('\\b'+word.split('').join('[\\s.]+')+'\\b\\.?','g'),word] as const);
/** Only search text is normalized. Stop names, IDs and objects remain untouched. */
export function normalizeStopSearch(value:unknown):string {
  if(value===undefined||value===null||value==='')return '';
  let text=String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
  for(const [pattern,word] of ABBREVIATION_PATTERNS)text=text.replace(pattern,word);
  return text.replace(/\b(?:[a-z]\.)+[a-z]\b\.?/g,match=>match.replace(/[^a-z]/g,''))
    .replace(/\b(?:stanowisko|stan|st|nr)\.?\s*(\d+[a-z]?)\b/g,'st $1')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

type Form={text:string;tokens:string[];alias:boolean};
type Entry<T>={stop:T;order:number;forms:Form[];numbers:Set<string>;nameNumbers:Set<string>;carriers:Set<string>};
type Match={cost:number;fuzzy:boolean;infix:boolean};
type TokenMatches=Map<string,Match>;
export type StopSearchIndex<T extends Stop>={
  entries:Entry<T>[];
  vocabulary:string[];
  owners:Map<string,number[]>;
  tokenCache:Map<string,TokenMatches>;
};
export type StopSearchOptions={carrier?:string;favoritesOnly?:boolean;location?:{lat:number;lon:number}|null};
export type StopSearchAliases=Readonly<Record<string,readonly string[]>>;
const tokens=(text:string)=>[...new Set(text.split(' ').filter(Boolean))];
const hasNumber=(token:string)=>/\d/.test(token);
const numberKey=(token:string)=>token.replace(/^0+(?=\d)/,'');
const numbersIn=(text:string)=>tokens(text).filter(hasNumber).map(numberKey);
const providerKey=(provider:string)=>provider==='mpk'?'mpk_rzeszow':provider;

function aliasesFor(stop:Stop,aliases:StopSearchAliases):string[]{
  const keys=new Set([stop.id]);
  for(const provider of new Set([...stop.carriers.map(c=>providerKey(c.id)),...(stop.sourceProviderIds||[]).map(providerKey)])){
    keys.add(provider+':'+stop.id);
    for(const id of String(stop.providerStopIds?.[provider]||'').split(',').map(s=>s.trim()).filter(Boolean))keys.add(provider+':'+id);
  }
  return [...keys].flatMap(key=>aliases[key]||[]);
}
/** Expand descriptors present in the name; a carrier alone is never a station.
 * In particular, “zajezdnia PKS” does not acquire a bus-station synonym.
 */
function descriptorForms(text:string):string[]{
  const forms=new Set<string>();
  if(/\bda\b/.test(text)){
    forms.add(text.replace(/\bda\b/g,'dworzec autobusowy'));
    forms.add(text.replace(/\bda\b/g,'dworzec pks'));
  }
  if(/\bdworzec (?:autobusowy|pks)\b/.test(text)){
    forms.add(text.replace(/\bdworzec (?:autobusowy|pks)\b/g,'da'));
    forms.add(text.replace(/\bdworzec pks\b/g,'dworzec autobusowy'));
  }
  if(/\bpkp\b/.test(text)){
    // These remain independent search results, never merged station identities.
    const base=text.replace(/\b(?:dworzec|stacja)\s+(?:glowny\s+)?pkp\b/g,'pkp');
    forms.add(base.replace(/\bpkp\b/g,'dworzec kolejowy'));
    forms.add(base.replace(/\bpkp\b/g,'stacja kolejowa'));
  }
  if(/\b(?:dworzec kolejowy|stacja kolejowa)\b/.test(text))forms.add(text.replace(/\b(?:dworzec kolejowy|stacja kolejowa)\b/g,'pkp'));
  return [...forms];
}

/** Build once per catalog revision; no network, geolocation request or deduplication. */
export function createStopSearchIndex<T extends Stop>(stops:readonly T[],aliases:StopSearchAliases=STOP_SEARCH_ALIASES):StopSearchIndex<T>{
  const owners=new Map<string,number[]>();
  const entries=stops.map((stop,order)=>{
    const raw=stop.name,official=normalizeStopSearch(raw),displayText=displayStopCatalogLabel(raw,stop.code),display=displayText===raw?official:normalizeStopSearch(displayText);
    const forms:Form[]=[],seen=new Set<string>();
    const add=(text:string,alias:boolean)=>{if(!text||seen.has(text))return;seen.add(text);forms.push({text,tokens:tokens(text),alias});};
    add(official,false);add(display,false);
    const explicit=aliasesFor(stop,aliases).map(normalizeStopSearch);
    for(const text of explicit)add(text,true);
    for(const text of [official,display,...explicit])for(const descriptor of descriptorForms(text))add(descriptor,true);
    // Codes are supplementary search data, never replacements for an official name.
    const code=normalizeStopSearch(stop.code);
    if(code)for(const form of [...forms]){add(form.text+' '+code,form.alias);add(form.text+' st '+code,form.alias);}
    const vocabulary=new Set(forms.flatMap(f=>f.tokens)),nameNumbers=new Set(numbersIn(official)),numbers=new Set([...vocabulary].filter(hasNumber).map(numberKey));
    for(const word of vocabulary){const list=owners.get(word)||[];list.push(order);owners.set(word,list);}
    const carriers=new Set([...stop.carriers.map(c=>c.id),...(stop.sourceProviderIds||[])].map(p=>p==='mpk_rzeszow'?'mpk':p));
    return {stop,order,forms,numbers,nameNumbers,carriers};
  });
  return {entries,owners,vocabulary:[...owners.keys()],tokenCache:new Map()};
}

/** Bounded optimal-string-alignment distance, including adjacent transpositions. */
function editDistance(a:string,b:string,limit:number):number {
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i),before=previous;
  for(let i=1;i<=a.length;i++){
    const current=Array(b.length+1).fill(limit+1);current[0]=i;let minimum=current[0];
    for(let j=Math.max(1,i-limit);j<=Math.min(b.length,i+limit);j++){
      current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+Number(a[i-1]!==b[j-1]));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])current[j]=Math.min(current[j],before[j-2]+1);
      minimum=Math.min(minimum,current[j]);
    }
    if(minimum>limit)return limit+1;
    before=previous;previous=current;
  }
  return previous[b.length];
}
function matchToken<T extends Stop>(index:StopSearchIndex<T>,query:string):TokenMatches {
  const cached=index.tokenCache.get(query);if(cached)return cached;
  const matches:TokenMatches=new Map(),numeric=hasNumber(query),limit=query.length>=9?2:query.length>=4?1:0;
  for(const word of index.vocabulary){
    if(numeric){if(hasNumber(word)&&numberKey(query)===numberKey(word))matches.set(word,{cost:0,fuzzy:false,infix:false});continue;}
    if(word===query){matches.set(word,{cost:0,fuzzy:false,infix:false});continue;}
    if(word.startsWith(query)){matches.set(word,{cost:5,fuzzy:false,infix:false});continue;}
    if(word.includes(query)){matches.set(word,{cost:12,fuzzy:false,infix:true});continue;}
    if(!limit||hasNumber(word)||query.length>48)continue;
    let distance=editDistance(query,word,limit),prefix=false;
    if(distance>limit&&query.length>=5&&word.length>query.length){const shortened=editDistance(query,word.slice(0,query.length),1);if(shortened<=1){distance=shortened;prefix=true;}}
    if(distance<=limit)matches.set(word,{cost:40+distance*10+(prefix?5:0),fuzzy:true,infix:false});
  }
  if(index.tokenCache.size>=80)index.tokenCache.delete(index.tokenCache.keys().next().value!);
  index.tokenCache.set(query,matches);return matches;
}
function allowed<T extends Stop>(entry:Entry<T>,options:StopSearchOptions){
  return (!options.favoritesOnly||entry.stop.isFavorite)&&(!options.carrier||options.carrier==='all'||entry.carriers.has(options.carrier));
}
function distance(stop:Stop,location:StopSearchOptions['location']){
  if(!location||![location.lat,location.lon,stop.lat,stop.lon].every(Number.isFinite))return Infinity;
  return Math.hypot((stop.lat!-location.lat)*111320,(stop.lon!-location.lon)*111320*Math.cos(location.lat*Math.PI/180));
}

/** Return the original object references. All meaningful tokens must match one form.
 * Exact names/aliases precede prefix, token, infix and typo matches; GPS only breaks
 * otherwise identical scores. Numeric tokens are exact (02 and 2 are equivalent).
 */
export function searchStops<T extends Stop>(index:StopSearchIndex<T>,query:unknown,options:StopSearchOptions={}):T[]{
  const text=normalizeStopSearch(query);
  if(!text)return index.entries.filter(entry=>allowed(entry,options)).map(entry=>entry.stop);
  const words=tokens(text),queryNumbers=words.filter(hasNumber).map(numberKey),matches=words.map(word=>matchToken(index,word));
  let candidates:Set<number>|null=null;
  for(const alternatives of matches){
    const ids=new Set<number>();for(const word of alternatives.keys())for(const id of index.owners.get(word)||[])if(candidates===null||candidates.has(id))ids.add(id);
    candidates=ids;if(!ids.size)return [];
  }
  const ranked:Array<{entry:Entry<T>;tier:number;cost:number;numberPenalty:number;distance:number}>=[];
  for(const id of candidates||[]){
    const entry=index.entries[id];if(!allowed(entry,options)||!queryNumbers.every(n=>entry.numbers.has(n)))continue;
    let bestTier=Infinity,bestCost=Infinity;
    for(const form of entry.forms){
      let cost=0,fuzzy=false,infix=false,complete=true;
      for(const alternatives of matches){
        let best:Match|undefined;for(const word of form.tokens){const m=alternatives.get(word);if(m&&(!best||m.cost<best.cost))best=m;}
        if(!best){complete=false;break;}cost+=best.cost;fuzzy||=best.fuzzy;infix||=best.infix;
      }
      if(!complete)continue;
      const tier=form.text===text?(form.alias?1:0):form.text.startsWith(text)?(form.alias?3:2):fuzzy?6:infix?5:4;
      if(tier<bestTier||(tier===bestTier&&cost<bestCost)){bestTier=tier;bestCost=cost;}
    }
    if(Number.isFinite(bestTier))ranked.push({entry,tier:bestTier,cost:bestCost,numberPenalty:queryNumbers.filter(n=>!entry.nameNumbers.has(n)).length,distance:distance(entry.stop,options.location)});
  }
  ranked.sort((a,b)=>a.tier-b.tier||a.numberPenalty-b.numberPenalty||a.cost-b.cost||(Number.isFinite(a.distance)||Number.isFinite(b.distance)?a.distance-b.distance:0)||a.entry.order-b.entry.order);
  return ranked.map(item=>item.entry.stop);
}
