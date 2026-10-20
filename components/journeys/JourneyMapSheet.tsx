'use client';
import {formatJourneyDuration} from '@/lib/journey-duration';
import {useId,useRef,useState} from 'react';
import {ChevronUp,ChevronDown,Route} from 'lucide-react';
import type {Journey} from '@/lib/journey-planner';
import {warsawClock} from '@/lib/transit-time';
import JourneyStages from './JourneyStages';

/** The handle supports dragging and the same action by click or keyboard. */
export default function JourneyMapSheet({journey,activeLeg,onFocusLeg}:{journey:Journey;activeLeg:number|null;onFocusLeg:(index:number|null)=>void}){
 const [expanded,setExpanded]=useState(false),[dragHeight,setDragHeight]=useState<number|null>(null);
 const start=useRef<{y:number;height:number}|null>(null),lastDrag=useRef(0),sheet=useRef<HTMLElement>(null),id=useId();
 const lines=[...new Set(journey.legs.filter(l=>l.walking===undefined).map(l=>l.line))];
 const description=[formatJourneyDuration(journey.arrival-journey.departure),lines.length?(lines.length===1?'Linia ':'Linie ')+lines.join(', '):'Pieszo',journey.walking>0?`${journey.walking} m pieszo`:null].filter(Boolean).join(' · ');
 const toggle=()=>{setDragHeight(null);setExpanded(value=>!value);};
 return <section ref={sheet} className={'connections-map-sheet'+(expanded?' is-expanded':'')} aria-label="Podróż na mapie" style={dragHeight===null?undefined:{height:dragHeight,transition:'none'}}>
  <button className="connections-sheet-handle" aria-controls={id} aria-expanded={expanded} aria-label={expanded?'Zwiń szczegóły podróży':'Rozwiń szczegóły podróży'}
   onPointerDown={event=>{start.current={y:event.clientY,height:sheet.current!.getBoundingClientRect().height};event.currentTarget.setPointerCapture(event.pointerId);}}
   onPointerMove={event=>{if(!start.current)return;const maximum=Math.max(112,Math.min(innerHeight*.58,innerHeight-220));setDragHeight(Math.max(112,Math.min(maximum,start.current.height+start.current.y-event.clientY)));}}
   onPointerUp={event=>{if(!start.current)return;const delta=start.current.y-event.clientY;if(Math.abs(delta)>12){lastDrag.current=Date.now();setExpanded(delta>0);}start.current=null;setDragHeight(null);}}
   onPointerCancel={()=>{start.current=null;setDragHeight(null);}}
   onClick={()=>{if(Date.now()-lastDrag.current>100)toggle();}}>
   <span className="connections-sheet-grip" aria-hidden="true"/>
   <span className="connections-sheet-summary"><span><strong>{warsawClock(journey.departure)} <span aria-hidden="true">→</span> {warsawClock(journey.arrival)}</strong><small>{description}</small></span>{expanded?<ChevronDown size={19}/>:<ChevronUp size={19}/>}</span>
  </button>
  <div id={id} className="connections-sheet-content" hidden={!expanded}>
   <button className="connections-sheet-all" onClick={()=>{onFocusLeg(null);setExpanded(false);}}><Route size={16}/>Pokaż całą podróż</button>
   <div className="connections-journey-timeline"><JourneyStages journey={journey} activeLeg={activeLeg} onSelectLeg={index=>{onFocusLeg(index);setExpanded(false);}}/></div>
  </div>
 </section>;
}
