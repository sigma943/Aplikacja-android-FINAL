/** The operator-facing data site moved domains; old URLs can return frozen feeds. */
export function currentMpkSource(url:string){
  try{
    const parsed=new URL(url);
    if(parsed.hostname==='mpkrzeszow.pl'||parsed.hostname==='www.mpkrzeszow.pl'){
      return 'https://kmrzeszow.live'+parsed.pathname+parsed.search;
    }
  }catch{/* Relative app endpoints and unrelated providers keep their own routing. */}
  return url;
}
