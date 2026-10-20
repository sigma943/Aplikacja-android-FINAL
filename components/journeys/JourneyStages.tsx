'use client';
import {formatJourneyDuration} from '@/lib/journey-duration';
import {Bus,Footprints,Clock,ChevronDown,MapPin} from 'lucide-react';
import {warsawClock} from '@/lib/transit-time';
import {stopCount} from '@/lib/polish-count';
import {journeyDepartureLabel,journeyArrivalLabel,journeyDestinationLabel} from '@/lib/journey-label';
import {displayStopCatalogLabel} from '@/lib/stop-label';
import type {Journey} from '@/lib/journey-planner';
import type {Stop} from '@/Panel/src/types';
const providers=[['pks','PKS Rzeszów'],['mpk','MPK Rzeszów'],['marcel','Marcel']];
const label=(stop:Stop)=>displayStopCatalogLabel(stop.name,stop.code);
function JourneyDelayBadge({seconds}:{seconds?:number}){
 if(seconds===undefined||!Number.isFinite(seconds)||seconds===0)return null;
 const minutes=Math.ceil(Math.abs(seconds)/60),late=seconds>0;
 return <span className={'connections-delay-badge '+(late?'is-late':'is-early')} aria-label={(late?'Opóźnienie ':'Przyspieszenie ')+minutes+' min'} title="Godziny uwzględniają dane na żywo">{late?'+':'−'}{minutes} min</span>;
}

export default function JourneyStages({journey,activeLeg,onSelectLeg}:{journey:Journey;activeLeg?:number|null;onSelectLeg?:(index:number)=>void}){
 return <>{journey.legs.map((l,i)=><div key={i} className="connections-ride">
       {i>0&&l.departure>journey.legs[i-1].arrival&&<div className="connections-wait"><Clock size={14}/><span>Czas na przesiadkę · {formatJourneyDuration(l.departure-journey.legs[i-1].arrival)}</span></div>}
       <div className={"connections-leg-card"+(activeLeg===i?" is-focused":"")} data-provider={l.provider}>
        <div className="connections-leg-heading"><span className="connections-stage-number">{i+1}</span>{onSelectLeg?<button type="button" className="connections-leg-mode connections-leg-focus" data-journey-leg={i} disabled={!onSelectLeg} aria-pressed={activeLeg===i} aria-label={'Pokaż na mapie: '+(l.walking!==undefined?'Pieszo, '+l.walking+' m':'Linia '+l.line)} onClick={()=>onSelectLeg?.(i)}>{l.walking!==undefined?<Footprints size={16}/>:<Bus size={16}/>}<strong>{l.walking!==undefined?'Pieszo':'Linia '+l.line}</strong><MapPin size={12}/></button>:<span className="connections-leg-mode" data-journey-leg={i}>{l.walking!==undefined?<Footprints size={16}/>:<Bus size={16}/>}<strong>{l.walking!==undefined?'Pieszo':'Linia '+l.line}</strong></span>}<span className="connections-duration">{formatJourneyDuration(l.arrival-l.departure)}{l.walking!==undefined?' · '+l.walking+' m':''}</span></div>
        <div className="connections-timeline">
         <div className="connections-timeline-row"><div className="connections-departure-clock"><time>{warsawClock(l.departure)}</time>{l.walking===undefined&&<JourneyDelayBadge seconds={l.delaySeconds}/>}</div><span className="connections-timeline-dot"/><h3>{journeyDepartureLabel(l,i)}</h3></div>
         <div className="connections-timeline-provider">{l.walking!==undefined?(l.walkingQuality==='verified'?'Trasa piesza':'Dojście pieszo · szacowane'):providers.find(p=>p[0]===l.provider)?.[1]||l.provider}</div>
         <div className="connections-timeline-row"><time>{warsawClock(l.arrival)}</time><span className="connections-timeline-dot"/><strong>{journeyArrivalLabel(l,i===journey.legs.length-1)}</strong></div>
        </div>

       {l.stops&&l.stops.length>2&&<details className="connections-stop-details"><summary><span className="connections-disclosure-icon"><Clock size={17}/></span><span className="connections-disclosure-copy"><strong>{stopCount(l.stops.length)}</strong><small>Godziny przyjazdu</small></span><span className="connections-disclosure-chevron"><ChevronDown size={17}/></span></summary><ol>{l.stops.map((call,index)=><li key={index}><div><time>{warsawClock(index===0?call.departure:call.arrival)}</time>{call.scheduledArrival!==undefined&&call.scheduledArrival!==call.arrival&&<del>{warsawClock(call.scheduledArrival)}</del>}</div><span>{i===journey.legs.length-1&&index===l.stops!.length-1?journeyDestinationLabel(call.stop):label(call.stop)}</span></li>)}</ol></details>}
       </div>
      </div>)}</>;
}
