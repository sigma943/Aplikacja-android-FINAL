'use client';

import {useEffect, useState} from 'react';
import {readAppTheme,resolveAppTheme,THEME_SCREEN_COLORS,themeDecoration} from '@/lib/app-theme';

import {type DeviceRole} from '@/lib/admin/rbac';

import {CloudOff, RefreshCw, Wrench, ShieldAlert, Clock, Info} from 'lucide-react';


import {type DeviceData} from '@/components/firebase/types';

function getStoredThemeMode(){return resolveAppTheme(readAppTheme());}
function themeBackground(mode:string){return THEME_SCREEN_COLORS[resolveAppTheme(mode)].background;}
function themeTextColor(mode:string){return THEME_SCREEN_COLORS[resolveAppTheme(mode)].text;}
function useStartupThemeMode(){
  const [mode,setMode]=useState('dark-oled');
  useEffect(()=>{
    const update=()=>setMode(getStoredThemeMode());update();
    window.addEventListener('storage',update);window.addEventListener('pks-profile-applied',update);
    let media:MediaQueryList|undefined;
    try{media=window.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',update);}catch{}
    return()=>{window.removeEventListener('storage',update);window.removeEventListener('pks-profile-applied',update);try{media?.removeEventListener('change',update);}catch{}};
  },[]);
  return mode;
}

function themeShell(themeMode:string = getStoredThemeMode()) {
  themeMode=resolveAppTheme(themeMode);
  const isWarm = themeMode === 'light-warm';
  const isLight = themeMode === 'light' || isWarm;
  const isOled = themeMode === 'dark-oled';
  const isAurora = themeMode === 'dark-aurora';
  const mainStyle = {
    color: themeTextColor(themeMode),
  } as React.CSSProperties;
  const pageStyle = {
    backgroundColor: themeBackground(themeMode),
    color: themeTextColor(themeMode),
    ['--pks-loading-text' as string]: themeTextColor(themeMode),
  } as React.CSSProperties;

  if(themeMode==='dark-forest'||themeMode==='light-sky'){
    const forest=themeMode==='dark-forest';
    const decoration=`${themeDecoration(themeMode)},radial-gradient(ellipse at 20% 0%,${forest?'#23623a66':'#ffffffaa'},transparent 70%)`;
    Object.assign(pageStyle,{backgroundImage:decoration,'--startup-decoration':decoration});
    return {page:'pks-themed-screen',pageStyle,glow:'',grid:'',mainStyle,
      card:forest?'border-emerald-200/20 bg-[#102f23]/90 shadow-black/30':'border-[#527fa3]/25 bg-[#d5efff]/90 shadow-sky-900/15',
      main:forest?'text-[#edf9f0]':'text-[#103750]',sub:forest?'text-[#b7d8c3]':'text-[#315f7d]',spinner:forest?'#67dca0':'#1679b7'};
  }
  if (themeMode === 'light-pink') {
    return {page:'bg-[#ffd1e8] text-[#57153c]',pageStyle,glow:'',grid:'',card:'border-pink-200 bg-[#ffd1e8]/90 shadow-pink-900/10',main:'text-[#57153c]',mainStyle,sub:'text-[#832557]',spinner:'#c02674'};
  }
  if (isWarm) {
    return {
      page: 'bg-[#f2ede1] text-[#272116]',
      pageStyle,
      glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(0,163,162,0.09),transparent_34%)]',
      grid: 'bg-[linear-gradient(rgba(93,79,50,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(93,79,50,0.045)_1px,transparent_1px)]',
      card: 'border-[#d8cdb2] bg-[#faf7ef]/86 shadow-[0_24px_70px_rgba(93,79,50,0.16)]',
      main: 'text-[#272116]',
      mainStyle,
      sub: 'text-[#746a58]',
      spinner: '#00A3A2',
    };
  }

  if (isLight) {
    return {
      page: 'bg-slate-50 text-slate-950',
      pageStyle,
      glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(99,102,241,0.10),transparent_34%)]',
      grid: 'bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)]',
      card: 'border-slate-200 bg-white/86 shadow-[0_24px_70px_rgba(15,23,42,0.12)]',
      main: 'text-slate-950',
      mainStyle,
      sub: 'text-slate-500',
      spinner: '#00A3A2',
    };
  }

  if (isOled) {
    return {
      page: 'bg-[#000000] text-white',
      pageStyle,
      glow: '',
      grid: '',
      card: 'border-white/10 bg-[#050505] shadow-[0_24px_70px_rgba(0,0,0,0.55)]',
      main: 'text-white',
      mainStyle,
      sub: 'text-slate-400',
      spinner: '#22d3ee',
    };
  }

  if (themeMode === 'dark-pink') {
    return {
      page: 'bg-[#21121b] text-[#fff2f8]', pageStyle,
      glow: '', grid: '',
      card: 'border-pink-300/18 bg-[#35202d]/86 shadow-black/30',
      main: 'text-[#fff2f8]', mainStyle, sub: 'text-[#dfbccf]', spinner: '#f9a8d4',
    };
  }

  if (isAurora) {
    return {
      page: 'bg-[#06130f] text-white',
      pageStyle,
      glow: 'bg-[radial-gradient(circle_at_44%_10%,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(59,130,246,0.16),transparent_36%)]',
      grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
      card: 'border-emerald-300/10 bg-[#0b1b16]/82 shadow-[0_24px_70px_rgba(0,0,0,0.42)]',
      main: 'text-white',
      mainStyle,
      sub: 'text-emerald-100/55',
      spinner: '#34d399',
    };
  }

  return {
    page: 'bg-[#111027] text-white',
    pageStyle,
    glow: 'bg-[radial-gradient(circle_at_50%_15%,rgba(129,107,255,0.18),transparent_38%),radial-gradient(circle_at_18%_78%,rgba(0,163,162,0.08),transparent_34%)]',
    grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
    card: 'border-white/10 bg-[#17162f]/80 shadow-black/30',
    main: 'text-white',
    mainStyle,
    sub: 'text-slate-400',
    spinner: '#22d3ee',
  };
}

function LoadingScreen() {
  const mode=useStartupThemeMode();
  const theme=themeShell(mode);

  useEffect(() => {

    const current=getStoredThemeMode();
    const bg = themeBackground(current);
    const text = themeTextColor(current);
    document.documentElement.dataset.pksTheme=current;
    document.documentElement.style.setProperty('--pks-initial-bg', bg);
    document.documentElement.style.setProperty('--pks-loading-text', text);
    document.documentElement.style.backgroundColor = bg;
    document.documentElement.style.color = text;
    document.body.style.backgroundColor = bg;
    document.body.style.color = text;
  }, [mode]);

  return (
    <div data-startup-theme={mode} style={theme.pageStyle} className={`pks-loading-screen min-h-screen overflow-hidden ${theme.page} flex items-center justify-center p-6 font-sans relative`}>
      {theme.glow && <div className={`absolute inset-0 ${theme.glow}`} />}
      {theme.grid && <div className={`absolute inset-0 ${theme.grid} bg-[size:64px_64px] opacity-50`} />}
      <div className="relative z-10 flex flex-col items-center gap-5">
        <svg className="h-16 w-16" viewBox="0 0 64 64" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke={`${theme.spinner}35`}
            strokeWidth="5"
          />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke={theme.spinner}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="72 164"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 32 32"
              to="360 32 32"
              dur="0.9s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
        <p className="pks-loading-label text-base font-black tracking-tight">Ładowanie aplikacji</p>
      </div>
    </div>
  );
}

function startupFailureMessage(error:unknown) {
  const code=String((error as {code?:string})?.code||'');
  if(code.includes('permission-denied'))return 'Firebase odrzucił przywrócenie profilu. Opublikuj aktualne reguły Firestore. Zapisana ranga nie została zmieniona.';
  if(code.includes('operation-not-allowed'))return 'Włącz logowanie anonimowe w Firebase Authentication.';
  if(error instanceof Error&&error.message.includes('identyfikatora Androida'))return error.message;
  return 'Nie udało się połączyć z Firebase. Sprawdź internet; aplikacja ponowi połączenie automatycznie.';
}

function ConnectionTimeoutScreen({ timeout = false,errorMessage }: { timeout?: boolean;errorMessage?:string }) {
  const themeMode=useStartupThemeMode();
  const theme=themeShell(themeMode);

  return (
    <div data-startup-theme={themeMode} style={themeShell(themeMode).pageStyle} className={`min-h-screen overflow-hidden ${theme.page} flex items-center justify-center p-6 font-sans relative`}>
      {theme.glow && <div className={`absolute inset-0 ${theme.glow}`} />}
      {theme.grid && <div className={`absolute inset-0 ${theme.grid} bg-[size:64px_64px] opacity-50`} />}
      <div className={`relative z-10 w-full max-w-md rounded-3xl border ${theme.card} p-8 text-center shadow-2xl backdrop-blur-2xl`}>
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-400/20 bg-red-500/12 text-red-400 shadow-[0_0_45px_rgba(248,113,113,0.18)]">
          <CloudOff size={38} strokeWidth={2.4} />
        </div>
        <h1 className={`text-2xl font-black tracking-tight ${theme.main}`}>
          {errorMessage ? 'Nie udało się przywrócić urządzenia' : timeout ? 'Przekroczono czas połączenia' : 'Brak połączenia z internetem'}
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-red-400">
          {errorMessage || (timeout ? 'Spróbuj ponownie. Aplikacja uruchomi się również automatycznie po przywróceniu połączenia.' : 'Sprawdź Wi-Fi lub transmisję danych.')}
        </p>
        <div className="my-7 h-px w-full bg-white/10" />
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mx-auto inline-flex h-12 min-w-56 items-center justify-center gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-6 text-sm font-black text-emerald-50 shadow-[0_0_26px_rgba(16,185,129,0.18)] transition-all hover:bg-emerald-500/25 active:scale-95"
        >
          <RefreshCw size={20} />
          Załaduj ponownie
        </button>
      </div>
    </div>
  );
}

function MaintenanceScreen({ onRefresh, checking }: { onRefresh: () => void | Promise<void>; checking: boolean }) {
  const themeMode=useStartupThemeMode();
  const isWarm = themeMode === 'light-warm';
  const isLight = themeMode === 'light' || isWarm;
  const isOled = themeMode === 'dark-oled';
  const isAurora = themeMode === 'dark-aurora';

  const shell=themeShell(themeMode);
  const theme = themeMode==='dark-forest'||themeMode==='light-sky' ? {...shell,icon:themeMode==='dark-forest'?'border-emerald-300/20 bg-emerald-400/10 text-emerald-200':'border-sky-700/20 bg-sky-100 text-sky-800',button:themeMode==='dark-forest'?'border-emerald-300/30 bg-emerald-400/15 text-emerald-100':'border-sky-700/25 bg-sky-100 text-sky-900'} : themeMode === 'light-pink'
    ? {page:'bg-[#ffd1e8] text-[#57153c]',glow:'',grid:'',card:'border-pink-200 bg-[#ffd1e8]/90 shadow-pink-900/10',icon:'border-pink-200 bg-pink-100 text-pink-700',sub:'text-[#832557]',button:'border-pink-300 bg-pink-100 text-pink-800 hover:bg-pink-200'}
    : themeMode === 'dark-pink'
    ? {page:'bg-[#21121b] text-[#fff2f8]',glow:'',grid:'',card:'border-pink-300/18 bg-[#35202d]/86 shadow-black/30',icon:'border-pink-300/20 bg-pink-300/10 text-pink-200',sub:'text-[#dfbccf]',button:'border-pink-300/30 bg-pink-300/10 text-pink-100 hover:bg-pink-300/15'}
    : isWarm
    ? {
        page: 'bg-[#f2ede1] text-[#272116]',
        glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(0,163,162,0.09),transparent_34%)]',
        grid: 'bg-[linear-gradient(rgba(93,79,50,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(93,79,50,0.045)_1px,transparent_1px)]',
        card: 'border-[#d8cdb2] bg-[#faf7ef]/86 shadow-[0_24px_70px_rgba(93,79,50,0.16)]',
        icon: 'border-amber-500/20 bg-amber-500/10 text-amber-600 shadow-[0_0_45px_rgba(245,158,11,0.18)]',
        sub: 'text-[#746a58]',
        button: 'border-[#00A3A2]/35 bg-[#00A3A2]/8 text-[#008f8e] shadow-[0_0_26px_rgba(0,163,162,0.10)] hover:bg-[#00A3A2]/12',
      }
    : isLight
      ? {
          page: 'bg-slate-50 text-slate-950',
          glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(99,102,241,0.10),transparent_34%)]',
          grid: 'bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)]',
          card: 'border-slate-200 bg-white/86 shadow-[0_24px_70px_rgba(15,23,42,0.12)]',
          icon: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-600 shadow-[0_0_45px_rgba(0,163,162,0.16)]',
          sub: 'text-slate-500',
          button: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-700 shadow-[0_0_26px_rgba(0,163,162,0.10)] hover:bg-cyan-500/10',
        }
      : isOled
        ? {
            page: 'bg-black text-white',
            glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%)]',
            grid: 'bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)]',
            card: 'border-white/10 bg-[#050505]/86 shadow-[0_24px_70px_rgba(0,0,0,0.55)]',
            icon: 'border-white/10 bg-white/5 text-cyan-300 shadow-[0_0_45px_rgba(0,163,162,0.18)]',
            sub: 'text-slate-500',
            button: 'border-cyan-400/35 bg-cyan-400/5 text-cyan-300 shadow-[0_0_26px_rgba(34,211,238,0.10)] hover:bg-cyan-400/10',
          }
        : isAurora
          ? {
              page: 'bg-[#06130f] text-white',
              glow: 'bg-[radial-gradient(circle_at_44%_10%,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(59,130,246,0.16),transparent_36%)]',
              grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
              card: 'border-emerald-300/10 bg-[#0b1b16]/82 shadow-[0_24px_70px_rgba(0,0,0,0.42)]',
              icon: 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300 shadow-[0_0_45px_rgba(16,185,129,0.20)]',
              sub: 'text-emerald-100/55',
              button: 'border-emerald-300/30 bg-emerald-400/5 text-emerald-300 shadow-[0_0_26px_rgba(16,185,129,0.10)] hover:bg-emerald-400/10',
            }
          : {
              page: 'bg-[#111027] text-white',
              glow: 'bg-[radial-gradient(circle_at_50%_15%,rgba(129,107,255,0.18),transparent_38%),radial-gradient(circle_at_18%_78%,rgba(0,163,162,0.08),transparent_34%)]',
              grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
              card: 'border-white/10 bg-[#17162f]/80 shadow-black/30',
              icon: 'border-white/10 bg-white/5 text-violet-300 shadow-[0_0_45px_rgba(129,107,255,0.18)]',
              sub: 'text-slate-400',
              button: 'border-cyan-400/35 bg-cyan-400/5 text-cyan-300 shadow-[0_0_26px_rgba(34,211,238,0.10)] hover:bg-cyan-400/10',
            };

  return (
    <div data-startup-theme={themeMode} style={themeShell(themeMode).pageStyle} className={`min-h-screen overflow-hidden ${theme.page} flex items-center justify-center p-6 font-sans relative`}>
      <div className={`absolute inset-0 ${theme.glow}`} />
      <div className={`absolute inset-0 ${theme.grid} bg-[size:64px_64px] opacity-50`} />

      <div className={`relative z-10 w-full max-w-md rounded-3xl border ${theme.card} p-8 text-center shadow-2xl backdrop-blur-2xl`}>
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border ${theme.icon}`}>
          <Wrench size={28} strokeWidth={2.4} />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Przerwa techniczna</h1>
        <p className={`mx-auto mt-7 max-w-xs text-sm leading-6 ${theme.sub}`}>
          Trwa przerwa techniczna.
          <br />
          Aplikacja będzie dostępna wkrótce.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={checking}
          className={`mx-auto mt-6 inline-flex h-10 min-w-44 items-center justify-center gap-3 rounded-2xl border px-6 text-sm font-black transition-all active:scale-95 disabled:cursor-wait disabled:opacity-70 ${theme.button}`}
        >
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Sprawdzanie' : 'Odśwież'}
        </button>
      </div>
    </div>
  );
}

function BanScreen({ device }: { device: DeviceData }) {
  const { banDetails } = device;
  const themeMode=useStartupThemeMode();
  const banTheme=themeShell(themeMode);
  const expireDate = banDetails?.expiresAt ? new Date(banDetails.expiresAt).toLocaleString('pl-PL') : 'Nigdy';
  const [silentError] = useState(() => {
    const codes = ['ERR_0x', 'E', 'APP-', 'SYS-'];
    const prefix = codes[Math.floor(Math.random() * codes.length)] || 'ERR_';
    return `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
  });
  const silentMessage = 'Wystąpił błąd. Spróbuj ponownie później.';
  const silentIsDark=themeMode.startsWith('dark');
  const gifUrl =
    banDetails?.gifUrl && !String(banDetails.gifUrl).startsWith('blob:')
      ? banDetails.gifUrl
      : '';

  if (banDetails?.silent) {
    return (
      <div data-startup-theme={themeMode} style={banTheme.pageStyle} className={[
        'min-h-screen flex items-center justify-center p-6 font-sans',
        silentIsDark ? 'bg-[#05070b] text-slate-100' : 'bg-slate-50 text-slate-900'
      ].join(' ')}>
        <div className="w-full max-w-md text-center">
          <div className={[
            'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border text-2xl font-black',
            banTheme.card+' '+banTheme.sub
          ].join(' ')}>
            !
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Błąd</h1>
          <p className={['mt-3 text-sm leading-6', silentIsDark ? 'text-slate-400' : 'text-slate-600'].join(' ')}>
            {silentMessage}
          </p>
          <div className={[
            'mx-auto mt-6 inline-flex rounded-xl border px-4 py-2 font-mono text-xs font-bold tracking-wide',
            banTheme.card+' '+banTheme.sub
          ].join(' ')}>
            {silentError}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main data-ban-screen data-startup-theme={themeMode} className={`min-h-dvh flex items-center justify-center px-4 py-8 font-sans ${banTheme.page}`} style={banTheme.pageStyle}>
      <section className={`w-full max-w-2xl overflow-hidden rounded-[28px] border p-5 shadow-2xl sm:p-8 ${banTheme.card}`}>
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[.16em] opacity-70"><span className="h-2 w-2 rounded-full bg-rose-400"/>PKS Live · Dostęp do aplikacji</div>
        <div className="mt-7 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 text-rose-400"><ShieldAlert size={25}/></div>
          <div className="min-w-0"><h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${banTheme.main}`}>Urządzenie zablokowane</h1><p className={`mt-2 text-sm leading-6 ${banTheme.sub}`}>Dostęp do aplikacji został ograniczony przez administratora.</p></div>
        </div>
        <dl className="mt-7 grid gap-3">
          <div className="flex items-start gap-3 rounded-2xl border border-current/10 bg-current/[.035] p-4"><Clock size={19} className="mt-0.5 shrink-0 opacity-60"/><div className="min-w-0"><dt className={`text-xs font-semibold ${banTheme.sub}`}>Blokada wygasa</dt><dd className="mt-1 break-words text-sm font-semibold">{expireDate}</dd></div></div>
          {banDetails?.reason&&<div className="flex items-start gap-3 rounded-2xl border border-current/10 bg-current/[.035] p-4"><Info size={19} className="mt-0.5 shrink-0 opacity-60"/><div className="min-w-0"><dt className={`text-xs font-semibold ${banTheme.sub}`}>Powód blokady</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{banDetails.reason}</dd></div></div>}
        </dl>
        {gifUrl&&<figure className="mt-5 rounded-2xl border border-current/10 bg-black/5 p-2"><img data-ban-image src={gifUrl} alt="Ilustracja do komunikatu blokady" className="mx-auto block h-auto max-h-[55dvh] w-auto max-w-full rounded-xl object-contain"/></figure>}
        <p className={`mt-6 text-xs leading-5 ${banTheme.sub}`}>Jeśli uważasz, że to błąd, skontaktuj się z administratorem.</p>
      </section>
    </main>
  );
}

export {getStoredThemeMode};
export {themeBackground};
export {themeTextColor};
export {themeShell};
export {LoadingScreen};
export {startupFailureMessage};
export {ConnectionTimeoutScreen};
export {MaintenanceScreen};
export {BanScreen};
