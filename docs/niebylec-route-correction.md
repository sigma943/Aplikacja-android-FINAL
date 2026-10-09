# Niebylec northbound Marcel stop approach

The stored northbound shapes entered the stop road from the northern junction of DK19, then doubled back to that junction. The requested route uses the southern link beside the Magnolia florist and turns left along the stop road, then left onto DK19 towards Rzeszów.

The replacement follows actual OpenStreetMap nodes on [way 171187883](https://www.openstreetmap.org/way/171187883) and [way 44306359](https://www.openstreetmap.org/way/44306359), checked 2026-10-09. Geometry: © OpenStreetMap contributors, ODbL 1.0. The operational northbound approach is based on the user's correction; the road map supplies coordinates, not proof of the operator's itinerary.

The transformation matches the recorded four-point local shape within eight metres and applies only to Marcel. It corrects the four matching northbound bundled variants and the same artifact in saved, supplied or newly routed geometry. Other providers, southbound routes and other excursions remain unchanged. Existing cached routes are corrected when read, so no new request or global cache reset is needed.

Tests verify stop order and endpoints for all 18 bundled Marcel variants, the exact four affected variants, the florist-link/platform/main-road order, provider isolation and idempotence. Browser checks verify green Marcel and orange MPK stop pins after selecting stops from the bus panel.
