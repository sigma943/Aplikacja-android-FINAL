import React from 'react';
import {createRoot} from 'react-dom/client';
import TextSelectionGuard from '../components/TextSelectionGuard';
import {BottomNavigation} from '../components/ApplicationChrome';
createRoot(document.getElementById('navigation-root')!).render(<><TextSelectionGuard/><BottomNavigation activeTab="map" className="pks-navigation" themeColor="#00a3a2" canOpenAdminEmbed onMap={()=>{}} onStops={()=>{}} onJourneys={()=>{}} onAdmin={()=>{}} onOptions={()=>{}}/></>);
