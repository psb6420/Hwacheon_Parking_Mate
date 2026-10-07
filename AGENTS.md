# Codex working guide

## Goal
Build a Hwacheon festival parking-distribution service for KNU RE:RISE 7.
This is a new repository, not a clone/fork of KANGWON_Parking_Mate.

## Current boundary
- All parking locations, capacities, shuttle schedules and walking times in src/catalog.js are sample data. Keep the visible demonstration notice until verified sources and actual operating permission exist.
- GitHub Pages hosts static frontend only. Empty VITE_API_BASE_URL uses browser-local storage; a configured API uses server/index.js and SQLite.
- Never put API/operator secrets into VITE_* variables or committed files.
- Do not claim actual parking availability, confirmed routes, booking guarantees or live IoT integration without working sources and verification.

## Structure
- src/domain.js: shared pure capacity/reservation/ranking rules.
- src/catalog.js: sample fixtures awaiting staff confirmation.
- src/store.js: local / remote data adapter.
- src/main.js and style.css: mobile-friendly Korean UI.
- server/index.js: authenticated operations, atomic SQLite state, 7-day terminal reservation cleanup, bounded audit log.

## Checks
Use Node 24+. Run npm test and npm run build. Verify reservation → QR → operator checkin → duplicate check rejection → checkout; check closed/full/stale states, mobile overflow, refresh, and /Hwacheon_Parking_Mate/ subpath hosting. Recheck public Pages deployment after changes.

## Next work
See docs/ROADMAP.md. Prioritize verified lot inventory and staff workflow over speculative AI features. Preserve existing booking holds when updating occupancy. Keep sample and verified data explicitly distinguishable.
