import {DEFAULT_INTERFACE_APPEARANCE,type InterfaceAppearance} from './interface-appearance';

export type InterfacePreset={
  name:string;description:string;theme:string;accent:string;glass:boolean;glow:boolean;glowStrength:number;
  appearance:InterfaceAppearance;
  preview:{background:string;surface:string;text:string};
};
const appearance=(changes:Partial<InterfaceAppearance>):InterfaceAppearance=>({...DEFAULT_INTERFACE_APPEARANCE,...changes});

export const INTERFACE_PRESETS:readonly InterfacePreset[]=[
  {
    name:'Różowy',description:'Cukierkowy róż, malinowe akcenty i subtelne serduszka',theme:'light-pink',accent:'#c02674',glass:true,glow:false,glowStrength:40,
    appearance:appearance({}),
    preview:{background:'#ffd1e8',surface:'#ffd1e8',text:'#57153c'},
  },
  {
    name:'Leśny',description:'Ciemna zieleń, delikatne liście i miękka szmaragdowa poświata',theme:'dark-forest',accent:'#67dca0',glass:true,glow:true,glowStrength:45,
    appearance:appearance({glassOpacity:86,glassBlur:18,borderStrength:16,shadowStrength:30,navIndicator:'halo',glowStyle:'accent',glowColor:'#67dca0',glowSpread:85,glowPlacement:'diagonal'}),
    preview:{background:'#061a13',surface:'#102f23',text:'#edf9f0'},
  },
  {
    name:'Niebo',description:'Błękitne panele, puszyste chmury i delikatna świetlista poświata',theme:'light-sky',accent:'#075985',glass:true,glow:true,glowStrength:40,
    appearance:appearance({glassOpacity:88,glassBlur:16,borderStrength:18,shadowStrength:25,navIndicator:'pill',glowStyle:'accent',glowColor:'#075985',glowSpread:90,glowPlacement:'diagonal'}),
    preview:{background:'#d5efff',surface:'#aedbfa',text:'#103750'},
  },
  {
    name:'Spokojny',description:'Piaskowe tło i delikatny turkus',theme:'light-warm',accent:'#00a3a2',glass:true,glow:true,glowStrength:30,
    appearance:appearance({panelRadius:26,cardRadius:20,shadowStrength:15,glassOpacity:86,glassBlur:14,surfaceTint:'warm',panelTintStrength:10,cardStyle:'original',navIndicator:'pill',glowStyle:'accent',glowColor:'#00a3a2',glowSpread:95,glowPlacement:'diagonal',titleWeight:600}),
    preview:{background:'#f2ede1',surface:'#faf7ef',text:'#272116'},
  },
  {
    name:'Nocny',description:'Głęboki granat i fioletowa poświata',theme:'dark-oled',accent:'#8b5cf6',glass:true,glow:true,glowStrength:60,
    appearance:appearance({glassOpacity:88,glassBlur:20,borderStrength:14,shadowStrength:15,surfaceTint:'accent',panelTintStrength:8,navIndicator:'halo',glowStyle:'accent',glowColor:'#8b5cf6',glowSpread:90,glowPlacement:'diagonal'}),
    preview:{background:'#080c10',surface:'#1e2237',text:'#f1f5f9'},
  },
  {
    name:'Czytelny',description:'Jasne karty i wyraźny niebieski akcent',theme:'light',accent:'#3b82f6',glass:false,glow:false,glowStrength:40,
    appearance:appearance({textScale:110,titleWeight:700,textContrast:'strong',iconSize:26,iconStroke:2.25,density:'spacious',borderStrength:20,shadowStrength:15,navIndicator:'block',reducedMotion:true}),
    preview:{background:'#eaf0f8',surface:'#ffffff',text:'#172536'},
  },
  {
    name:'Minimalny',description:'Grafit, lekkie linie i proste karty',theme:'dark',accent:'#94a3b8',glass:false,glow:false,glowStrength:40,
    appearance:appearance({panelRadius:18,cardRadius:14,controlRadius:10,borderStrength:10,shadowStrength:0,cardStyle:'flat',navIndicator:'pill',density:'compact',titleWeight:600}),
    preview:{background:'#101a26',surface:'#1b2937',text:'#f3f7fb'},
  },
];

export function matchesInterfacePreset(preset:InterfacePreset,current:{appearance:InterfaceAppearance;theme:string;accent:string;glass:boolean;glow:boolean;glowStrength:number}){
  return current.theme===preset.theme&&current.accent.toLowerCase()===preset.accent&&current.glass===preset.glass&&current.glow===preset.glow&&current.glowStrength===preset.glowStrength&&Object.entries(preset.appearance).every(([key,value])=>JSON.stringify(current.appearance[key as keyof InterfaceAppearance])===JSON.stringify(value));
}
