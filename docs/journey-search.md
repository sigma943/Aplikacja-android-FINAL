# Journey preferences and progressive search

`JourneyOptions.maxTransfers` is an upper bound, never an exact count. `-1`
removes that bound. Service-day and arrival constraints still apply. The
chronological scan uses dominance rather than a fixed depth or answer count to
stop redundant paths; staying aboard the same course is not a transfer.

`transferMinutes` is a minimum safety buffer, not a maximum wait. The UI's
“Bez limitu” choice sets the extra buffer to zero. Walking time to a different
pole still has to elapse. Waiting is allowed until the selected day's search
window ends; this option does not search future service days.

`walkMeters` is a preference at the public loader boundary. The deterministic
`journeyWalkingBudget` adds 10%, at least 20m and at most 50m; zero remains zero.
The effective budget is passed once to scanning, GPS access validation and pure
walking validation. Low-level scanning and access validation retain strict
budgets, avoiding repeated tolerance and cumulative footpath inflation. Actual
walking distances, rather than the requested preference, appear in results.

The planner passes `onPartial` to `searchConnections`. Online Marcel and live
vehicle requests start concurrently with a local PKS/MPK scan. Nonempty local
results are usable while the online work continues. The final scan includes
Marcel connections and live delays. If online requests add no connections or
vehicles, the local scan is reused. Stable journey IDs preserve open details.
Cancellation invalidates both phases and no stale result is published.

A failed Marcel route/course is isolated. Completed courses survive deadlines;
route and course requests have bounded concurrency. Courses are not discarded
merely because their first stop departs more than three hours before the query:
a user may board a long-running course farther along its route. Explicit stop
references are preserved; unmatched calls only share a fallback identity when
both their source identity and coordinates agree.

Scanning does not expand a dominated arrival into all nearby walking targets.
After the final permitted ride, only final destination walks are generated;
continuation on the same bus remains possible. Progress messages reset the
worker's 30-second inactivity watchdog, so a progressing complex search is not
terminated solely for exceeding 30 seconds in total. User cancellation still
terminates the worker.

Regression coverage includes the real PKS/MPK full-day feeds (60,849 connections,
2km walking preference, finite and unlimited transfers), a recorded Marcel
course connecting to the real PKS timetable, mixed-provider chains, same-minute
cycles, preference tolerance, failure isolation, progressive results and stale
result cancellation. This is not a live verification of any particular Lutcza
course; online availability and timetables still depend on Marcel's source.
