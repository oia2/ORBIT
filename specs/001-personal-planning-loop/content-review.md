# Content review

**Reviewed**: 2026-08-13 (post-remediation rerun)  
**Scope**: T104, current production bundle, production UI, domain unions, persistence mappings,
fixtures, and browser journeys

## Build under review

The content rerun exercised the production bundle whose entry assets were
`dist/assets/index-Buk3aADF.js` (SHA-256
`71A273273EECF07C8A0E1667CE743DA9832CD028C737580A38DD45E04474515E`) and
`dist/assets/index-DamcaIH_.css` (SHA-256
`84F35B51602E870F1526D90F0B88223E5857812AB032A59A7A4BA9D47E734693`).

## Outcome vocabulary

- Task plan outcomes are exactly `planned`, `completed`, `moved`, `backlogged`,
  `canceled`, `kept-unfinished`, and `deleted` in the model, mapper, fixtures, and
  History projection.
- Habit outcomes are exactly `pending`, `completed`, `not-completed`, and
  `deleted`.
- History translates persisted task outcomes to factual Russian phrases. It does
  not expose persistence implementation markers as product language.
- Searches across `src`, `tests`, and `e2e` found no product outcome named
  `partial` or `suppressed`. Matches for TypeScript's `Partial<T>` are type
  utilities, not domain or visible outcomes.

## Product language

The Week, Day, Backlog, History, not-found, storage lifecycle, shared controls,
task/habit dialogs, daily state, Close Day, and Complete Week surfaces use
Russian user-facing copy. Storage messages accurately state device locality,
loss risks, retry, blocked-upgrade, and reload requirements. Feedback is factual:
there is no praise, punishment, alarmist copy, inferred overload, proactive load
warning, or default Close Day destination.

The remediated shell presents the canonical `Сегодня`, `Неделя`, `Бэклог`,
`История` order. Its ready state says `Сохранено на устройстве` with a non-color
mark, and its desktop, tablet, and mobile disclosures state the device/browser
profile boundary, ordinary-session persistence, non-synchronization, and loss
conditions. Unsupported or denied persistent-storage requests add factual risk
copy without falsely reporting a failed application write as successful.

Day planned load remains a factual duration/task summary without a capacity
denominator, reserve, threshold, classification, or proactive warning. Week
goals remain descriptive text with contextual CRUD/reorder actions and no
numeric goal progress. History Dynamics contains only task completion, habit
completion, and the approved 70/30 result; Day has no Dynamics, while the
data-present Week and Month views retain exactly eight and six points.

The approved word “warning” remains only as an internal semantic color token for
a 50–69% Daily Score. The planned-load implementation comment explicitly rejects
capacity semantics and is not shown to users.

## Scope exclusions

Navigation and History contain no workout surface. History exposes no search,
arbitrary filter, correlations, generated insight, state analytics, or editing.
Daily state remains context and the visible formula states that it does not
affect the 70/30 result.

## Evidence

- Static vocabulary/scope searches across `src`, `tests`, and `e2e` were rerun
  on 2026-08-13. `partial` matches are TypeScript `Partial<T>` or atomicity test
  language; `suppressed` appears only in negative assertions. Production source
  contains no workout UI, load-capacity/overload wording, punitive/praising copy,
  or alternate 50/30/20 formula.
- The final `npm run verify` coverage phase passed all 61 files and 416 tests.
  The component and model suites
  cover the exhaustive outcome unions, persistence mappings, and the absence of
  `partial`, `suppressed`, and workout projections.
- `npm run typecheck`, scoped ESLint for the remediated journeys, and scoped
  Prettier checks passed.
- The production-preview command
  `npx playwright test --project=desktop-chromium-keyboard --project=tablet-webkit-touch --project=mobile-webkit-touch --retries=0 --reporter=line`
  passed 33/33 tests in 1.9 minutes. It verified the seven canonical journeys,
  exact History Dynamics scopes, Russian navigation and controls, IndexedDB
  reload/deep-link persistence, desktop/tablet/mobile locality disclosure, no
  workout link, 70/30 formula copy, factual load, neutral feedback, axe serious
  violations, reduced motion, non-color status, and viewport overflow coverage.
