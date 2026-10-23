/** Static, layered scenery; only the lighting changes, never the geometry. */
export default function HorizonLandscape(){
  const trees=[{x:4,y:360,h:165},{x:34,y:365,h:105},{x:62,y:370,h:77},{x:98,y:378,h:115},{x:138,y:383,h:62},{x:181,y:390,h:45},{x:1255,y:390,h:50},{x:1300,y:385,h:81},{x:1335,y:380,h:120},{x:1374,y:369,h:174},{x:1415,y:364,h:125},{x:1440,y:363,h:200}];
  return <svg data-horizon-landscape viewBox="0 0 1440 400" preserveAspectRatio="none" aria-hidden="true">
    <path fill="var(--horizon-ridge-far,#30355e)" d="M0 205L83 177L168 194L270 146L342 165L429 116L493 146L584 94L665 116L754 72L824 106L891 142L978 117L1074 167L1161 141L1240 175L1339 146L1440 183V400H0Z"/>
    <path fill="var(--horizon-ridge-mid,#202849)" d="M0 248L118 215L206 236L318 200L412 229L536 179L626 199L732 168L827 204L945 183L1054 215L1168 191L1280 234L1367 207L1440 224V400H0Z"/>
    <path fill="var(--horizon-ridge-near,#111c38)" d="M0 290Q95 248 186 277T367 284Q471 238 567 273T777 279Q884 247 989 279T1184 285Q1320 250 1440 278V400H0Z"/>
    <g data-horizon-town fill="#ffd299">{Array.from({length:40},(_,i)=><rect key={i} x={260+(i*71.39)%930} y={278+(i*17.1)%30} width={i%4===0?4:2} height={i%6===0?3:1.5} rx=".5" opacity={.3+(i%5)*.13}/>)}</g>
    <path fill="#080f27" d="M0 336Q110 304 203 339Q355 377 494 350Q675 323 834 351Q1002 380 1164 341Q1324 304 1440 333V400H0Z"/>
    <g fill="#070e24">{trees.map(({x,y,h},i)=><g key={i} transform={`translate(${x} ${y-h}) scale(${h/100})`}><path d="M-2 100V56H2V100ZM0 0L-13 24H-7L-20 42H-11L-26 63H-14L-32 86H32L14 63H26L11 42H20L7 24H13Z"/></g>)}</g>
  </svg>;
}
