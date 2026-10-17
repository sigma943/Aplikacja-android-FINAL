/** Chunk-loading shell. CSS exposes it only in Kosmos; other themes keep their loader. */
export default function CosmicTabLoading({label='Otwieranie przystanków…'}:{label?:string}){
  return <div data-cosmic-pending role="status" aria-live="polite">
    <div className="cosmic-loading-heading"><span className="cosmic-loading-orbit"/>{label}</div>
    <div aria-hidden="true" className="cosmic-loading-cards">{[0,1,2,3].map(i=><div key={i}><span/><section><i/><i/></section></div>)}</div>
  </div>;
}
