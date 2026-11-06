# Changelog

## Unreleased

- Register the card in the Lovelace card picker and report its size.
- Don't fail when the card script is loaded twice.
- Repository prepared for HACS: license, validation and release workflows, issue templates, full documentation.

## 1.4 – Android Fix

- `meal_vote_changed` now fires immediately on every tap (via `callWS`) instead of after a 3-second debounce, which didn't fire reliably in the Android Companion app.
- The "You can only edit your own entries" message is now dispatched as a `hass-notification` DOM event, avoiding a JS error.

## 1.3 – From State

- `meal_vote_changed` includes `from_vote`, the vote before the change.
