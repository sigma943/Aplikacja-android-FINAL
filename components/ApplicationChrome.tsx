'use client';
import {NAV_ITEMS,type NavItem} from '@/lib/interface-appearance';
import type {CSSProperties} from 'react';
import {motion} from 'motion/react';
import {Bus,Search,RefreshCw,X,Map as MapIcon,Settings,Shield} from 'lucide-react';
export function StopTabIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M11 7.5h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 14h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 20.5h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 7.5h.01M6 14h.01M6 20.5h.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

type HeaderProps={mapGlassPanel:string;mapGlassInput:string;themeColor:string;transparentUI:boolean;isDark:boolean;isManualRefreshing:boolean;showAlertDot:boolean;error?:string|null;isOffline:boolean;textSub:string;filterRoute:string;setFilterRoute:(value:string)=>void;handleManualRefresh:()=>void;closeMapPanelsForSearch:()=>void};
export function MapHeader({mapGlassPanel,mapGlassInput,themeColor,transparentUI,isDark,isManualRefreshing,showAlertDot,error,isOffline,textSub,filterRoute,setFilterRoute,handleManualRefresh,closeMapPanelsForSearch}:HeaderProps){return (
<div className={`${mapGlassPanel} rounded-[1.4rem] border p-3 md:p-4 flex flex-col gap-3 pointer-events-auto w-full md:w-96 transition-all`}>
                <div className="flex items-center justify-between font-extrabold text-xl tracking-tight" style={{ color: themeColor }}>
                  <div className="flex items-center gap-2">
                     <Bus className="w-5 h-5 md:w-6 md:h-6" />
                     <span className="text-lg md:text-xl">PKS Live</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                        onClick={handleManualRefresh}
                        className={`p-1.5 rounded-xl transition-all active:scale-90 relative ${transparentUI ? 'hover:bg-white/10' : (isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100')} ${isManualRefreshing ? 'text-blue-500' : (isDark ? 'text-slate-400' : 'text-slate-500')}`}
                        title="Odśwież ręcznie"
                     >
                        <RefreshCw className={`w-4 h-4 ${isManualRefreshing ? 'animate-spin' : ''}`} />
                     </button>
                     {showAlertDot ? (
                        <span className="relative flex h-2.5 w-2.5" title={error || (isOffline ? 'Offline' : 'Błąd')}>
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                           <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                        </span>
                     ) : (
                        <span className="relative flex h-2.5 w-2.5" title="LIVE">
                           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                           <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                     )}
                  </div>
                </div>
                
                <div className="relative shrink-0">
                  <Search className={`absolute left-3 top-2.5 h-4 w-4 opacity-60 ${textSub}`} />
                  <input
                    type="text"
                    className={`w-full py-2 pl-10 pr-10 rounded-xl text-sm focus:outline-none focus:ring-2 transition-all font-medium placeholder-opacity-60 ${mapGlassInput}`}
                    style={{ '--tw-ring-color': themeColor + '80' } as CSSProperties}
                    placeholder="Filtruj linię (np. 108)..."
                    value={filterRoute}
                    onPointerDown={closeMapPanelsForSearch}
                    onFocus={closeMapPanelsForSearch}
                    onChange={(e) => setFilterRoute(e.target.value)}
                  />
                  {filterRoute && (
                     <button onClick={() => setFilterRoute('')} className={`absolute right-3 top-2.5 opacity-60 hover:opacity-100 ${textSub}`}>
                        <X className="w-4 h-4" />
                     </button>
                  )}
                </div>

              </div>
);}

type NavigationProps={preview?:boolean;order?:readonly NavItem[];activeTab:string;className:string;themeColor:string;isMapTabDisabled?:boolean;isStopsTabDisabled?:boolean;canOpenAdminEmbed?:boolean;onMap:()=>void;onStops:()=>void;onAdmin?:()=>void;onOptions:()=>void};
export function BottomNavigation({preview=false,order=NAV_ITEMS,activeTab,className,themeColor,isMapTabDisabled=false,isStopsTabDisabled=false,canOpenAdminEmbed=false,onMap,onStops,onAdmin,onOptions}:NavigationProps){
 const items={map:{label:'Mapa',Icon:MapIcon,disabled:isMapTabDisabled,onClick:onMap},stops:{label:'Przystanki',Icon:StopTabIcon,disabled:isStopsTabDisabled,onClick:onStops},admin:{label:'Admin',Icon:Shield,disabled:false,onClick:onAdmin},options:{label:'Opcje',Icon:Settings,disabled:false,onClick:onOptions}};
 return <div className={`pointer-events-auto flex h-[calc(64px+env(safe-area-inset-bottom))] w-full items-center justify-around border-t pb-[env(safe-area-inset-bottom)] transition-colors ${className}`}>
  {order.filter(id=>id!=='admin'||canOpenAdminEmbed).map(id=>{
   const item=items[id],Icon=item.Icon,active=activeTab===id;
   return <button type="button" key={id} data-nav-item={id} disabled={item.disabled} aria-current={active?'page':undefined} aria-label={item.label} onClick={item.onClick} className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5 transition-colors ${item.disabled?'cursor-not-allowed opacity-35 grayscale':active?'':'hover:text-current/90'}`} style={active?{color:themeColor}:{}}>
    <Icon className="h-6 w-6"/><span data-nav-label className="text-[11px] font-semibold leading-none">{item.label}</span>
    {active&&<motion.span data-nav-indicator layoutId={preview?undefined:'navigation-active-tab'} transition={{type:'spring',stiffness:420,damping:36}} className="absolute top-0 h-0.5 w-10 rounded-full" style={{backgroundColor:themeColor}}/>}
   </button>;
  })}
 </div>;
}
