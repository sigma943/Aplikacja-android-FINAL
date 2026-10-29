import {INTERFACE_FONTS,parseGoogleFontLink,interfaceFontStack} from './interface-fonts';
import {normalizeUiAccent} from './ui-accent';
export function vehicleHeaderStyle(color:string,glass:boolean,isDark=true){
  // An opaque, pale carrier tint keeps dark text readable over any bright map.
  if(!isDark){
    const hex=normalizeUiAccent(color);
    const tint='#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*0.18+255*0.82).toString(16).padStart(2,'0')).join('');
    return {background:tint};
  }
  if(!glass)return {background:color};
  // Composite once against a fixed dark material. Expanding a sheet must not
  // recolour its header by exposing a different map or cosmic layer beneath it.
  const hex=normalizeUiAccent(color),base=[8,13,29];
  const tint=(alpha:number)=>'#'+[1,3,5].map((i,j)=>Math.round(parseInt(hex.slice(i,i+2),16)*alpha+base[j]*(1-alpha)).toString(16).padStart(2,'0')).join('');
  return {background:`linear-gradient(135deg, ${tint(.48)}, ${tint(.28)})`};
}

export const NAV_ITEMS=['map','stops','journeys','admin','options'] as const;
export type NavItem=typeof NAV_ITEMS[number];
export interface InterfaceAppearance {
  statusBarOverlay:boolean;
  startScreen:'map'|'journeys'|'stops'|'admin';navOrder:NavItem[];departureView:'simple'|'detailed';
  markerSize:number;markerLabel:'line'|'carrier'|'icon';
  panelRadius:number; cardRadius:number; controlRadius:number;
  borderStrength:number; shadowStrength:number;
  glassOpacity:number; glassBlur:number; glassBlurEnabled:boolean; glassSaturation:number;
  surfaceTint:'original'|'accent'|'warm'|'custom';
  panelColor:string; panelTintStrength:number; cardStyle:'original'|'soft'|'outlined'|'flat'; buttonStyle:'original'|'solid'|'outline';
  textScale:number; fontFamily:string; customFontUrl:string; titleWeight:number;
  letterSpacing:number; tabularNumbers:boolean;
  density:'comfortable'|'compact'|'spacious';
  iconSize:number; iconStroke:number; navLabels:boolean;
  navIndicator:'line'|'pill'|'halo'|'block'|'none'; inactiveOpacity:number;
  chromeStyle:'modern'|'classic'; navLayout:'stacked'|'inline'; panelPattern:'none'|'grid'|'dots'|'diagonal'; patternStrength:number;
  textContrast:'standard'|'strong';
  reducedMotion:boolean; hoverHighlight:boolean;
  glowStyle:'graphite'|'accent'|'mixed'; glowColor:string;
  glowSpread:number; glowPlacement:'corners'|'center'|'diagonal';
}
export const DEFAULT_INTERFACE_APPEARANCE:InterfaceAppearance={
  statusBarOverlay:true,
  startScreen:'map',navOrder:[...NAV_ITEMS],departureView:'detailed',markerSize:100,markerLabel:'line',
  panelRadius:24,cardRadius:20,controlRadius:12,borderStrength:12,shadowStrength:30,
  glassOpacity:64,glassBlur:18,glassBlurEnabled:true,glassSaturation:135,surfaceTint:'original',panelColor:'#64748b',panelTintStrength:35,cardStyle:'original',buttonStyle:'original',
  textScale:100,fontFamily:'system',customFontUrl:'',titleWeight:700,letterSpacing:0,tabularNumbers:true,
  density:'comfortable',iconSize:24,iconStroke:2,navLabels:true,navIndicator:'line',inactiveOpacity:100,
  reducedMotion:false,hoverHighlight:true,chromeStyle:'modern',navLayout:'stacked',panelPattern:'none',patternStrength:12,textContrast:'standard',
  glowStyle:'mixed',glowColor:'#00a3a2',glowSpread:75,glowPlacement:'corners',
};
export const INTERFACE_APPEARANCE_KEY='mks_interface_appearance_v1';
export function normalizeNavOrder(value:unknown):NavItem[]{
 const order=[...new Set(Array.isArray(value)?value.filter((id):id is NavItem=>NAV_ITEMS.includes(id as NavItem)):[])];
 if(order.length&&!order.includes('journeys'))order.splice(Math.max(0,order.indexOf(order.includes('stops')?'stops':'map')+1),0,'journeys');
 return [...order,...NAV_ITEMS].filter((id,index,all)=>all.indexOf(id)===index);
}
export function normalizeInterfaceAppearance(input:unknown):InterfaceAppearance{
  const v=input&&typeof input==='object'?input as Record<string,unknown>:{};
  const d=DEFAULT_INTERFACE_APPEARANCE;
  const n=(key:keyof InterfaceAppearance,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key] as number)):d[key] as number;
  const choice=<K extends keyof InterfaceAppearance>(key:K,values:readonly InterfaceAppearance[K][])=>values.includes(v[key] as InterfaceAppearance[K])?v[key] as InterfaceAppearance[K]:d[key];
  const flag=(key:keyof InterfaceAppearance)=>typeof v[key]==='boolean'?v[key] as boolean:d[key] as boolean;
  return {
    statusBarOverlay:flag('statusBarOverlay'),
    startScreen:choice('startScreen',['map','journeys','stops','admin']),
    navOrder:normalizeNavOrder(v.navOrder),
    departureView:choice('departureView',['simple','detailed']),markerSize:n('markerSize',80,140),markerLabel:choice('markerLabel',['line','carrier','icon']),
    panelRadius:n('panelRadius',0,36),cardRadius:n('cardRadius',0,30),controlRadius:n('controlRadius',0,24),
    borderStrength:n('borderStrength',0,40),shadowStrength:n('shadowStrength',0,100),
    glassOpacity:n('glassOpacity',20,100),glassBlur:n('glassBlur',0,28),glassBlurEnabled:flag('glassBlurEnabled'),glassSaturation:135,
    surfaceTint:choice('surfaceTint',['original','accent','warm','custom']),panelColor:normalizeUiAccent(typeof v.panelColor==='string'?v.panelColor:d.panelColor),panelTintStrength:n('panelTintStrength',5,55),cardStyle:choice('cardStyle',['original','soft','outlined','flat']),buttonStyle:choice('buttonStyle',['original','solid','outline']),textScale:n('textScale',90,120),
    fontFamily:v.fontFamily==='custom'&&parseGoogleFontLink(v.customFontUrl)?'custom':choice('fontFamily',INTERFACE_FONTS.map(font=>font.id)),customFontUrl:parseGoogleFontLink(v.customFontUrl)?.url||'',titleWeight:n('titleWeight',500,800),letterSpacing:0,tabularNumbers:true,
    density:choice('density',['comfortable','compact','spacious']),iconSize:n('iconSize',18,30),iconStroke:n('iconStroke',1,3),
    navLabels:flag('navLabels'),navIndicator:choice('navIndicator',['line','pill','halo','block','none']),inactiveOpacity:100,
    chromeStyle:choice('chromeStyle',['modern','classic']),navLayout:choice('navLayout',['stacked','inline']),panelPattern:choice('panelPattern',['none','grid','dots','diagonal']),patternStrength:n('patternStrength',5,30),textContrast:choice('textContrast',['standard','strong']),
    reducedMotion:flag('reducedMotion'),hoverHighlight:true,
    glowStyle:choice('glowStyle',['graphite','accent','mixed']),glowColor:normalizeUiAccent(typeof v.glowColor==='string'?v.glowColor:d.glowColor),
    glowSpread:n('glowSpread',40,100),glowPlacement:choice('glowPlacement',['corners','center','diagonal']),
  };
}

/** A single SVG layer repeats without changing the size of the glow gradients. */
export function interfacePanelPattern(v:InterfaceAppearance,dark:boolean){
  if(v.panelPattern==='none')return 'linear-gradient(transparent,transparent)';
  const ink=dark?'white':'black',opacity=v.patternStrength/100;
  const shape=v.panelPattern==='dots'?'<circle cx="3" cy="3" r="1"/>':v.panelPattern==='grid'?'<path d="M24 0H0V24" fill="none" stroke-width=".7"/>':'<path d="M-6 6L6 -6M0 24L24 0M18 30L30 18" fill="none" stroke-width=".7"/>';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><g fill="${ink}" stroke="${ink}" opacity="${opacity}">${shape}</g></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function interfaceAppearanceVariables(v:InterfaceAppearance,dark:boolean,accent:string,lightEffects:boolean,theme=''){
  const color=normalizeUiAccent(accent),base=theme==='dark-forest'?'#102f23':theme==='light-sky'?'#d5efff':theme==='dark-oled'?'#141d26':theme==='dark-cosmos'?'#080a12':theme==='dark-pink'?'#35202d':theme==='light-pink'?'#ffd1e8':theme==='light-warm'?'#faf7ef':dark?'#1b2937':'#f7fafc';
  const target=v.surfaceTint==='custom'?v.panelColor:v.surfaceTint==='accent'?color:'#d2c2a4';
  const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const bg=rgb(base).map((c,i)=>Math.round(v.surfaceTint==='original'?c:c*(1-v.panelTintStrength/100)+rgb(target)[i]*v.panelTintStrength/100));
  const variables:Record<string,string>={
    '--personal-panel-radius':`${v.panelRadius}px`,'--personal-card-radius':`${v.cardRadius}px`,'--personal-control-radius':`${v.controlRadius}px`,
    '--personal-edge':`rgba(${dark?'255,255,255':'15,23,42'},${v.borderStrength/100})`,
    '--personal-shadow':lightEffects?'none':`0 8px ${12+v.shadowStrength*.3}px rgba(0,0,0,${Math.min(v.shadowStrength,lightEffects?15:100)/400})`,
    '--personal-glass':`rgba(${bg.join(',')},${lightEffects?1:v.glassOpacity/100})`,
    '--personal-surface':`rgb(${bg.join(',')})`,
    '--personal-blur':`${v.glassBlurEnabled&&!lightEffects?Math.min(v.glassBlur,28):0}px`,'--personal-saturation':`${v.glassSaturation}%`,
    '--personal-title-weight':`${v.titleWeight}`,'--personal-letter-spacing':`${v.letterSpacing}px`,
    '--personal-font':interfaceFontStack(v),
    '--personal-icon-size':`${v.iconSize}px`,'--personal-icon-stroke':`${v.iconStroke}`,'--personal-inactive-opacity':`${v.inactiveOpacity/100}`,
    '--personal-marker-scale':String(v.markerSize/100),
    '--personal-nav-map':String(v.navOrder.indexOf('map')),'--personal-nav-stops':String(v.navOrder.indexOf('stops')),'--personal-nav-journeys':String(v.navOrder.indexOf('journeys')),'--personal-nav-admin':String(v.navOrder.indexOf('admin')),'--personal-nav-options':String(v.navOrder.indexOf('options')),
    '--personal-muted':dark?'#dbe5ef':'#334155',
    '--personal-pattern-image':interfacePanelPattern(v,dark),
    '--personal-row-padding':v.density==='compact'?'8px':v.density==='spacious'?'18px':'12px',
  };
  for(const [key,size] of Object.entries({'9':9,'10':10,'11':11,'12':12,'13':13,'14':14,'15':15,'18':18,'20':20,xs:12,sm:14,base:16,lg:18,xl:20,'2xl':24,'3xl':30,'4xl':36}))variables[`--personal-text-${key}`]=`${size*v.textScale/100}px`;
  return variables;
}

/** Keep original styles exactly until each property is customized. */
export function applyInterfaceAppearance(root:HTMLElement,v:InterfaceAppearance,dark:boolean,accent:string,lightEffects:boolean,theme=''){
  const defaults=DEFAULT_INTERFACE_APPEARANCE;
  const attrs:Record<string,string>={
    statusBarOverlay:String(v.statusBarOverlay),
    radius:String(v.panelRadius!==defaults.panelRadius),cardRadius:String(v.cardRadius!==defaults.cardRadius),controlRadius:String(v.controlRadius!==defaults.controlRadius),
    border:String(v.borderStrength!==defaults.borderStrength),shadow:String(v.shadowStrength!==defaults.shadowStrength),
    blurRadiusCustom:String(v.glassBlur!==defaults.glassBlur),
    glass:String(v.glassOpacity!==defaults.glassOpacity||v.surfaceTint!=='original'),blur:String(!v.glassBlurEnabled||v.glassBlur!==defaults.glassBlur||v.glassSaturation!==defaults.glassSaturation),frost:v.glassBlurEnabled&&v.glassBlur>0?'on':'off',
    cardStyle:v.cardStyle,buttonStyle:v.buttonStyle,surface:v.surfaceTint,text:String(v.textScale!==100),font:v.fontFamily,title:String(v.titleWeight!==700),spacing:String(v.letterSpacing!==0),
    numbers:v.tabularNumbers?'tabular':'proportional',density:v.density,icons:String(v.iconSize!==24||v.iconStroke!==2),
    chrome:v.chromeStyle,departures:v.departureView,marker:v.markerLabel,layout:v.navLayout,pattern:v.panelPattern,contrast:v.textContrast,labels:String(v.navLabels),nav:v.navIndicator,inactive:String(v.inactiveOpacity!==100),lightEffects:lightEffects?'on':'off',mapMotion:v.reducedMotion?'reduced':'normal',motion:v.reducedMotion?'reduced':'normal',hover:String(v.hoverHighlight),
  };
  for(const [key,value] of Object.entries(attrs))root.setAttribute('data-personal-'+key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value);
  const variables=interfaceAppearanceVariables(v,dark,accent,lightEffects,theme);
  for(const [key,value] of Object.entries(variables))root.style.setProperty(key,value);
  return ()=>{for(const key of Object.keys(attrs))root.removeAttribute('data-personal-'+key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()));for(const key of Object.keys(variables))root.style.removeProperty(key);};
}
