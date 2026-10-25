# Avoiding return trips to an interchange

When two paths reach the same outgoing bus, the connection scan can keep a
variant that rides past an earlier feasible interchange, then returns on that
bus. Equal final arrivals and less walking can conceal the unnecessary ride.

`tightenJourneyInterchanges` inspects the recorded, ordered calls of consecutive
ride legs after scanning. It can shorten the incoming ride and board the same
outgoing course farther along its actual calls, preserving the final arrival.
It only changes a result if combined riding/walking time falls by at least a
minute. It keeps both rides nonempty and retains every provider and course ID.

Candidates must permit alighting/boarding, satisfy the minimum transfer buffer,
and fit the effective per-walk budget. Different stop IDs remain different; a
walking leg is explicit even when the coordinates coincide. No name-based stop
merging or assumed service at unlisted points is used. Least-walking sorting
never gains additional walking. Source objects and schedules remain untouched;
trimmed legs invalidate any old supplied geometry so the map cannot retain the
detour. Intermediate call boarding/alighting flags are carried through from the
feed for this validation.

Regression fixtures cover Niebylec/Polomia return trips, nearby separate poles,
zero and small walking budgets, insufficient time, prohibited boarding and
alighting, live/scheduled times, immutability and idempotence. One integration
case uses the real local PKS course 5840 with a controlled reverse Marcel course;
its Marcel times are test data, not a verification of the live 17:23 arrival in
the reported screenshot.

The shared stop list now owns a clipped themed layer in preview/full modes.
Journey picker artwork lives behind controls, with a separate layer in the map
confirmation panel. Street tiles never receive decorations. Cloud, forest and
pink patterns use the existing `themeDecoration`; cosmic layers reuse the same
local artwork, reduced-motion handling and visibility-aware effects as chrome.
