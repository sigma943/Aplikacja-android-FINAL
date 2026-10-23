# Local stop search

`Panel/src/components/StopList.tsx` is shared by the Stops tab (including favorites
and its full list), both planner endpoint pickers, and the standalone Panel app.
The list still renders the same cards, provider filters and pagination/virtualized
full list. `onStopSelect(stop)` receives the same object reference returned from
its input array. The planner's existing `choosePlace` and `journeyPickerStops`
remain unchanged, including the existing safe Rzeszów D.A. station grouping.

Data enters this UI from `components/stops-panel/StopsPanel.tsx` and
`lib/journey-catalog.ts`, via the existing catalog builder/cache. PKS stop points,
MPK stop points and Marcel's indexed stops keep their existing identities and
provider mappings. Search does not call those loaders or change their data.
Search-like helpers in `stop-domain.ts` used for identity consolidation are not
user search and have deliberately not been changed. Vehicle/line filters are also
outside this change.

## Search index

`lib/stop-search.ts` prepares normalized forms, numeric tokens, provider sets and
an inverted token index when the list's input data changes. The existing React
`useDeferredValue` still schedules typing updates. Query-time typo distance is
computed once per unique vocabulary word, not separately for every stop; up to 80
query-token expansions are cached within each index. A new catalog array rebuilds
the index and invalidates that cache. There are no network, AI, paid service,
permission, GPS or storage dependencies.

Only search strings are normalized: Polish diacritics, case, punctuation and
whitespace, including known dotted/spaced abbreviations. Digits are retained.
Numeric tokens must match exactly, allowing leading zero equivalence (02 = 2).
They never participate in typo matching. Code fields supplement names, and names
containing the requested number take priority over an otherwise equal code match.

Literal exact official names rank first, followed by exact aliases, official
prefixes, alias prefixes, complete token matches, infix matches and bounded typo
matches. Every meaningful query token must match the same search form; returning
an unrelated stop because only “Kolonia” matched would be misleading. Token order
is unrestricted. Typo matching uses bounded adjacent-transposition edit distance:
none for 1–3 letters, one edit for 4–8, at most two for longer words. Incomplete
words of at least five letters can have a one-edit prefix match. Numeric tokens
remain exact throughout. Equal scores retain input order (and the list's existing
favorite ordering). An optional already-known location can only break otherwise
equal text scores; the current UI does not request or pass new location data.

Search returns every eligible matching entry, never automatically selecting,
merging, renaming or discarding duplicate names with different IDs. Existing
provider/favorite filters remain in force. Empty input preserves existing order.
No route, timetable, transfer, map or carrier logic is changed.

## Aliases

`lib/stop-search-aliases.ts` contains only search aliases keyed by existing stable
catalog IDs or qualified provider identities. The initial colloquial aliases are
for verified Rzeszów D.A. terminal IDs from the checked-in PKS snapshot (area 1937)
and existing terminal supplement, plus the planner's existing grouped station ID.
The alias is never displayed or passed as a replacement for a stop name or ID.

To add a local nickname, first confirm the actual stop/platform ID and provider.
Add it to that record; if ambiguous, list every confirmed identity. Unknown keys
cannot create results. Never use a name-only lookup or silently resolve ambiguous
names to one stop. Other local nicknames need that confirmation before inclusion.

Descriptor expansions are conservative: D.A. and “dworzec autobusowy / PKS” are
search variants. PKP and railway-station phrases expand within their name context.
A carrier ID or standalone PKS in “Zajezdnia PKS” does not imply a bus station.
City tokens remain mandatory, so Rzeszów cannot silently replace another city.

## Verification

`test/stop-search.test.cjs` covers normalization, word order, fuzzy thresholds,
number safety, alias identity/provenance, stable ranking, ambiguous duplicates,
three providers, optional location, catalog revisions, immutable selection and the
real packaged PKS/MPK catalog. `test/stop-search-browser.cjs` drives the unchanged
StopList and both planner pickers offline, checking typed text, official labels,
original object/ID selection, existing pagination and catalog updates. Both are
included in the Android build checks.
