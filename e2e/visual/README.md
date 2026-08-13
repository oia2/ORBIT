# ORBIT visual-conformance suite

This suite is intentionally separate from `e2e/journeys`. It fixes the browser clock at
2026-05-20, writes deterministic populated or empty IndexedDB snapshots, disables motion,
and checks the production preview at the approved desktop viewport plus representative
tablet and mobile widths.

Run the fail-first suite with:

```powershell
npm run build
npx playwright test --project=visual-chromium
```

Missing screenshot baselines are a failure. The helper refuses Playwright's normal
first-run baseline creation, so the known-broken implementation cannot be accepted by
accident. No broad screenshot masks are permitted.

Only after the remediated rendering passes the structural assertions and has been
reviewed against the frozen Open Design references may the reviewed images be written:

```powershell
$env:ORBIT_VISUAL_BASELINE_APPROVAL='remediated-review-complete'
npx playwright test --project=visual-chromium --update-snapshots
Remove-Item Env:ORBIT_VISUAL_BASELINE_APPROVAL
```

Commit the resulting files under `e2e/visual/__screenshots__/visual-chromium/` as the
approved reconciled baselines. Subsequent runs use Playwright's tightly bounded
pixel comparison and must not set the approval variable. The helper also rejects
every later `--update-snapshots` replacement unless the same deliberate approval
token is supplied after a fresh reference review.

Stable `data-od-id` hooks are part of the rendered design contract. They allow geometry
checks without coupling the tests to localized copy:

- shell: `app-shell`, `app-rail`, `app-content`, `persistence-status`,
  `mobile-navigation`;
- Day: `day-header`, `day-layout`, `day-load`, `day-tasks`, `day-score`,
  `day-habits`, `day-state`, `close-day`;
- Week: `week-header`, `week-layout`, `week-progress`, `week-daily-results`,
  `week-summary`, `week-habits`, `week-goals`;
- History: `history-header`, `history-layout`, `history-calendar`,
  `history-selected-day`, `history-dynamics`.
