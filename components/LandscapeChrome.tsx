/** Restrained glass lighting: no miniature scenery behind map controls. */
export default function LandscapeChrome({variant}:{variant:'filter'|'navigation'}){
  return <span data-landscape-chrome={variant} aria-hidden="true"/>;
}
