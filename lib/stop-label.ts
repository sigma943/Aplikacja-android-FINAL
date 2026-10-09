/** Presentation only: keep platform numbers in identities, matching and routing. */
export function displayStopLabel(value:unknown):string {
  return String(value??'').trim().replace(/(?<!\p{L})D\s*\.?\s*A\s*\.?(?:\s*[,/-]?\s*(?:st(?:anowisko)?\.?\s*)?\d+[a-z]?)?\s*$/iu,'D.A.');
}
