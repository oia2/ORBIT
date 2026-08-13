# Manual accessibility evidence

**Build reviewed**: production build created 2026-08-13  
**Status**: blocked pending access to real devices and assistive-technology users/tools

## Automated evidence already complete

- Keyboard-oriented Chromium canonical journeys at 1440px.
- Touch-engine journeys at 820px and 390px.
- Reflow/overflow assertions at 360–1920px, visible essential actions, 44px
  targets, reduced-motion rules, live status/alert semantics, non-color score
  text, and targeted axe serious/critical scans.
- Real IndexedDB reload and deep-link refresh checks.
- IndexedDB blocked-upgrade and termination behavior in real-adapter tests.

These checks do not substitute for the manual steps required by T107.

## Required external execution

The following remain unexecuted and must be observed against the stable build:

1. Real-device touch operation on representative mobile and tablet hardware.
2. Manual keyboard traversal, focus order, dialog initial focus, Escape behavior,
   and focus return after every modal workflow.
3. Screen-reader announcements for initialization, successful save, validation,
   command/storage failure, blocked upgrade, and reload-required states.
4. Human contrast inspection and browser zoom/reflow at 200% and 400%.
5. Operating-system reduced-motion behavior and confirmation that every status
   remains understandable without color.
6. A genuine second-tab blocked-upgrade/recovery exercise in a browser session.

No pass/fail result has been fabricated. T107 remains open until a person with
the required hardware and assistive technology records these observations.

