# Protected public UI — explicit user requirements

These rules apply to all changes and publications of PRIME. Read before editing public files. Preserve unrelated live changes through the shared safe publisher; never deploy an entire old checkout.

The user explicitly requires that future changes preserve these pillars unless they explicitly request changing that specific pillar:

- Home theme: keep the historical dark palette and white text recovered before commit 05f86da. Do not reintroduce the home-blue override (#101b29/#162536) across the page. Keep the light theme working.
- Plans: retain the updated benefit icons and official service marks in landing.js and landing-composition.css. Never roll them back as part of a theme/content change.
- Cookies: settings control retracts to the edge, expands on hover/keyboard focus, remains accessible on touch, and follows page theme variables. The preferences dialog also follows the page theme. Preserve saved consent, optional categories default off, and all consent logic.
- Videos: canonical behavior recovered from the 31 October video-scroll-hotfix. Start automatically when centered/visible; select the closest eligible video to viewport center; pause offscreen WITHOUT seeking back to zero; resume when centered again. Mouse movement must not restart or stop playback. Preserve the existing lower-video rewind interaction and audio controls; hero remains muted. Keep the poster until playback begins, with no artificial 0.28-second reveal delay or repeated animation loops that cause flashes. Do not replace video files, geometry, masks, posters or playback rules during theme edits.

Before publication: take a fresh live snapshot. Make the smallest targeted edit. Compare untouched pillars against the live snapshot, preserving their current content and asset URLs. Never copy an older whole HTML/CSS/JS file over current live files. Update cache versions only for intentionally changed assets.

Verify in the integrated Codex browser: automatic play at center, pause offscreen, resume without reset, no hover-triggered restart, poster-to-video transition, lower-video interaction; inspect home colors, plan icons, cookie collapse and preferences dialog. If verification cannot run, state that limitation. Record hashes/behavior checks so future releases cannot silently revert these pillars. Follow docs/SAFE-PUBLISHING.md for every Fly publication.

User-approved update, 2 November 2026: on phones (max-width:760px), dark home surfaces are slightly lighter: --bg:#10161b; --panel:#161e25; --soft:#1c2730. Preserve this mobile-only adjustment; desktop and light theme keep their prior colors.
