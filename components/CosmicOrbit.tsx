/** Dedicated decorative space keeps celestial bodies clear of controls. */
export default function CosmicOrbit({scope,wide=false}:{scope:string;wide?:boolean}){
  return <div data-cosmic-orbit={scope} data-cosmic-panel={`orbit:${scope}`} className={`cosmic-orbit${wide?' cosmic-orbit-wide':''}`} aria-hidden="true">
    <img data-cosmic-orbit-planet alt="" decoding="async" />
    <img data-cosmic-orbit-sun src="/themes/kosmos/sun.svg" alt="" decoding="async" />
  </div>;
}
