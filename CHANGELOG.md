# Changelog

## 1.4.0 – Android Fix (2026-11-07)

First public release.

- `meal_vote_changed` now fires immediately on every tap (via `callWS`) instead of after a 3-second debounce, which didn't fire reliably in the Android Companion app.
- The "You can only edit your own entries" message is now dispatched as a `hass-notification` DOM event, avoiding a JS error.
- The card is listed in the Lovelace card picker and reports its size to the dashboard.
- Loading the card script twice no longer throws an error.
- Repository prepared for HACS: license, validation and release workflows, issue templates, full documentation.

## 1.3 – From State

- `meal_vote_changed` includes `from_vote`, the vote before the change.
