/** Presentation only: keep platform numbers in identities, matching and routing. */
export function displayStopLabel(value:unknown):string {
  return String(value??'').trim().replace(/(?<!\p{L})D\s*\.?\s*A\s*\.?(?:\s*[,/-]?\s*(?:st(?:anowisko)?\.?\s*)?\d+[a-z]?)?\s*$/iu,'D.A.');
}

/** Terminal platforms are shown in the stop catalog and on map icons only. */
export function rzeszowTerminalPlatform(value:unknown,code?:unknown):string|null {
  const match=/^Rzesz[oó]w\s*,?\s+D\s*\.?\s*A\s*\.?(?:\s*[,/-]?\s*(?:st(?:anowisko)?\.?\s*)?(\d+[a-z]?))?\s*$/iu.exec(String(value??'').trim());
  if(!match)return null;
  const platform=String(match[1]??code??'').trim();
  if(!/^\d+[a-z]?$/i.test(platform))return null;
  return platform.replace(/^0+(?=\d)/,'').toUpperCase();
}

export function displayStopCatalogLabel(value:unknown,code?:unknown):string {
  const label=displayStopLabel(value),platform=rzeszowTerminalPlatform(value,code);
  return platform===null?label:`${label} st. ${platform}`;
}
