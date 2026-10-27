import {useEffect,useState} from 'react';
import MapStopSheet from '../components/MapStopSheet';
const forecast='MPK: prognozy na żywo są niedostępne; pokazano dostępny rozkład.';
export default function MapStopWarningFixture({dark}:{dark:boolean}){
 const [kind,setKind]=useState('schedule');useEffect(()=>{(window as any).__mapStopCase=setKind;},[]);
 const error=kind==='error'?'Nie udało się odświeżyć danych.':kind==='mixed'?forecast+' Nie udało się odświeżyć danych.':forecast;
 const departures=kind==='empty'?[]:[{id:'one',line:'11',direction:'Matuszczaka',color:'#ff7a00',time:'05:20',day:'',delayMinutes:0}];
 return <div className="pks-theme-root" data-ui-theme="dark-mountains" style={{position:'relative',height:'100vh'}}><MapStopSheet preview name="Rzeszów Matuszczaka / Rymanowska 02" expanded onExpandedChange={()=>{}} transparent dark={dark} loading={false} error={error} departures={departures}/></div>;
}
