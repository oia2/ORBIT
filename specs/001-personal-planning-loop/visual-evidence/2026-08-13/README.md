# T105 retained visual evidence — 2026-08-13

This directory records the reproducible visual evidence used to reassess T105
after the forensic audit. The evidence combines frozen Open Design renders,
rendered production-application baselines, and structural geometry assertions.
The state-by-state assessment is in [comparison.md](comparison.md).

## Evidence boundary

- The review result is an agent comparison against the frozen references plus
  an automated Playwright pixel/geometry result. It is **not** a claim of manual
  product-owner visual approval.
- The application baselines are reconciled artifacts. They intentionally do not
  reproduce prototype content that conflicts with approved specification
  semantics.
- Passing functional, accessibility, responsive-journey, or unit tests is not
  treated as visual-conformance evidence here. The visual suite is a separate
  required gate.
- The empty Day, Week, and History states have no separate Open Design artifact.
  Their comparison therefore uses the relevant populated page reference plus
  the canonical ORBIT card/empty grammar; it does not fabricate source approval.

## Deterministic production render

| Field | Retained value |
|---|---|
| Build and server | Production Vite output from `npm run build`, served by `npm run preview -- --host 127.0.0.1` |
| Base repository revision | `2265938bcc7fd51553cee03c2441527dd020bac5` |
| Revision qualification | Captures represent the remediated working tree atop that base revision; they are not claimed to be renders of the base commit alone |
| Production JavaScript | `dist/assets/index-Buk3aADF.js`; SHA-256 `71a273273eecf07c8a0e1667ce743da9832cd028c737580a38dd45e04474515e` |
| Production CSS | `dist/assets/index-DamcaIH_.css`; SHA-256 `84f35b51602e870f1526d90f0b88223e5857812ab032a59a7a4ba9d47e734693` |
| Dependency lock | `package-lock.json`; SHA-256 `e9f24f1d85e6ac52ae33d12b12e3a9e580f7ba90dadab6d50ad03b3f70bf23db` |
| Visual fixture | `e2e/fixtures/visual.fixture.ts`; SHA-256 `b84d734d1bb90686d5658c7a0119e6d3fbd8d3143bee69501958e39698fd2fa2` |
| Playwright configuration | `playwright.config.ts`; SHA-256 `197151dbbaf838e3247e82005680d6801062b0f07808a04696aee1353ff0cae2` |
| Clock | `2026-05-20T05:00:00Z` (`2026-05-20T05:00:00.000Z` in the fixture), equal to 12:00 in `Asia/Krasnoyarsk` |
| Seed | Deterministic populated and empty IndexedDB states from [`e2e/fixtures/visual.fixture.ts`](../../../../e2e/fixtures/visual.fixture.ts), using the repository history fixture and `EMPTY_ORBIT_SEED` |
| Desktop viewport | Exactly `1440 × 900` CSS px |
| Tablet viewport | Exactly `820 × 1180` CSS px |
| Mobile viewport | Exactly `390 × 844` CSS px |
| Browser setup | Playwright Chromium, device scale factor 1, `ru-RU`, `Asia/Krasnoyarsk`, dark color scheme, reduced motion |
| Capture mode | Full-page PNG at CSS scale after IndexedDB initialization, loading completion, font readiness, and two animation frames |
| Pixel policy | `maxDiffPixelRatio: 0.002`; baseline replacement is guarded by `ORBIT_VISUAL_BASELINE_APPROVAL=remediated-review-complete` |

The environment and capture behavior are executable in
[`playwright.config.ts`](../../../../playwright.config.ts),
[`desktop.visual.spec.ts`](../../../../e2e/visual/desktop.visual.spec.ts),
[`responsive.visual.spec.ts`](../../../../e2e/visual/responsive.visual.spec.ts),
and [`visual-assertions.ts`](../../../../e2e/visual/visual-assertions.ts).

The retained non-update visual run passed **16/16** checks: 13 pixel-baseline
comparisons and three structural geometry checks. The geometry checks cover the
220px desktop rail and page compositions, the 88px tablet rail and single-column
collapse, fixed mobile navigation, region ordering, and horizontal overflow.

## Frozen reference manifest

These hashes were recomputed from the retained files. Viewport images are the
same representative `1440 × 900` frame used for comparison; full images retain
the remainder of each reference page.

| Reference capture | Raster size | SHA-256 |
|---|---:|---|
| [`daily-detail-v2.viewport-1440x900.png`](../../visual-reference/rendered-1440x900/daily-detail-v2.viewport-1440x900.png) | 1440 × 900 | `13fb60a8c3f8cc8e9ecaac369dcb7a2c68900bc05896e78fc058a7102c540c3e` |
| [`daily-detail-v2.full.png`](../../visual-reference/rendered-1440x900/daily-detail-v2.full.png) | 1440 × 1237 | `5413a53b0a9425bba4aeb285638a4bffb285f76b6b5a3088b4575aed4be0ee41` |
| [`weekly-dashboard-v2.viewport-1440x900.png`](../../visual-reference/rendered-1440x900/weekly-dashboard-v2.viewport-1440x900.png) | 1440 × 900 | `7202b54400147abeabaf6523468342c91f3ec1f9bf4c2e50adc7b14518776290` |
| [`weekly-dashboard-v2.full.png`](../../visual-reference/rendered-1440x900/weekly-dashboard-v2.full.png) | 1440 × 1271 | `4ca895483de359501883563449136e15164d5b968d1fcee428e9c42859b166b6` |
| [`history.viewport-1440x900.png`](../../visual-reference/rendered-1440x900/history.viewport-1440x900.png) | 1440 × 900 | `031b8e15eefc860e2faf611ce1c15884912a4487ad4634c3a7d86d037ed1b17d` |
| [`history.full.png`](../../visual-reference/rendered-1440x900/history.full.png) | 1440 × 1278 | `d167c1ff83205e356d29cea2533e6ee78d5fc56119518ec9fe3d0b042146f1fc` |

Reference-generation details and clean resource/console results are retained in
the [reference render README](../../visual-reference/rendered-1440x900/README.md)
and [render report](../../visual-reference/rendered-1440x900/render-report.json).

## Desktop actual-baseline manifest

All captures below used the exact `1440 × 900` desktop viewport. Their taller
raster dimensions are expected because the gate deliberately retains the entire
rendered page, not only the initial viewport.

| Actual capture | Scenario | Raster size | SHA-256 |
|---|---|---:|---|
| [`desktop-shared-shell.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-shared-shell.png) | Populated Week route, shell scope | 1440 × 1906 | `180e5c1f2fd31eca361628ea9980f7d6489f6a20cdc85c4c559d361e502cdbdf` |
| [`desktop-day-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-day-populated.png) | Day populated | 1440 × 1270 | `ea2c611d1936668d37b9007ba515c33c83a349055e290292ed05c426d43a2713` |
| [`desktop-day-empty.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-day-empty.png) | Day empty | 1440 × 1346 | `f1b06f2ecc7f3418a939f9795bb1b714d1eca3bba3910e79af79723283db0f58` |
| [`desktop-week-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-week-populated.png) | Week populated | 1440 × 1906 | `180e5c1f2fd31eca361628ea9980f7d6489f6a20cdc85c4c559d361e502cdbdf` |
| [`desktop-week-empty.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-week-empty.png) | Week empty | 1440 × 1776 | `78f79aadb9a395176866243f2c96f8e3607a96f1ade2d7a654007a1992d46457` |
| [`desktop-history-month-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-history-month-populated.png) | History Month populated | 1440 × 1243 | `72ec7c5bda09d543e3a1120e141b2a795e628d1ea4c55b46c1d6c9f335524973` |
| [`desktop-history-month-empty.png`](../../../../e2e/visual/__screenshots__/visual-chromium/desktop-history-month-empty.png) | History Month empty | 1440 × 1306 | `84c6d789b27fee5ca9f505e4c23f239db5453444d2aac40082a3c976fa03145d` |

`desktop-shared-shell.png` and `desktop-week-populated.png` intentionally have
identical bytes: both capture the same populated Week route, with the former
retained as the explicit shared-shell evidence label.

## Responsive actual-baseline manifest

| Actual capture | Viewport | Raster size | SHA-256 |
|---|---:|---:|---|
| [`tablet-day-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/tablet-day-populated.png) | 820 × 1180 | 820 × 1907 | `ac4c3626cf495c30b047906f213442f33a328af790747a032ee71addeb3a6e5b` |
| [`tablet-week-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/tablet-week-populated.png) | 820 × 1180 | 820 × 2445 | `f3139a8e645fc847fee9903f210a7d82b9df4c591df714b4dc18cd005ccf1ed2` |
| [`tablet-history-month-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/tablet-history-month-populated.png) | 820 × 1180 | 820 × 1707 | `ae7687c0b59e513c10a78948c6a4e19a9da1c699c5a513b9043b3fddb09d2579` |
| [`mobile-day-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/mobile-day-populated.png) | 390 × 844 | 390 × 2493 | `6ea8ecb856c9d3110034129626f3235143d74f71a26aaa3bc05f6c090709fde7` |
| [`mobile-week-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/mobile-week-populated.png) | 390 × 844 | 390 × 2864 | `56f133ff06b6601ea180a611260609088ca17126b07f04b398870c84674304c0` |
| [`mobile-history-month-populated.png`](../../../../e2e/visual/__screenshots__/visual-chromium/mobile-history-month-populated.png) | 390 × 844 | 390 × 1945 | `e2ea5e4b8ce2e79b8f81d1a2b1b327acb2ec387c5437be920f638095ba6d0eb5` |

Future changes pass this evidence gate only when the existing baselines remain
within the configured pixel tolerance and all structural assertions pass. A
deliberately reviewed baseline replacement creates a new evidence event; it must
not silently overwrite this record.
