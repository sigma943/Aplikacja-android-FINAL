/** Search-only aliases. Keys are existing catalog IDs or qualified provider IDs.
 * Terminal IDs are verified against public/data/pks-stop-points.json (area 1937)
 * and lib/rzeszow-terminal-platforms.ts. The grouped picker ID already exists in
 * journey-places.ts. Never infer an identity from a name or a nearby coordinate.
 */
const rzeszowTerminal = [
  'dworzec autobusowy', 'dworzec PKS', 'PKS Rzeszów',
  'dworzec autobusowy Rzeszów', 'Rzeszów dworzec autobusowy',
  'Rzeszów dworzec PKS',
] as const;
export const STOP_SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'journey:rzeszow-da': rzeszowTerminal,
  'pks:3719': rzeszowTerminal,
  'pks:3720': rzeszowTerminal,
  'pks:3721': rzeszowTerminal,
  'pks:3723': rzeszowTerminal,
  'pks:3724': rzeszowTerminal,
  'pks:3725': rzeszowTerminal,
  'pks:3727': rzeszowTerminal,
  'pks:3731': rzeszowTerminal,
  'pks:3744': rzeszowTerminal,
  'terminal:rzeszow-da:7': rzeszowTerminal,
  'terminal:rzeszow-da:10': rzeszowTerminal,
};
