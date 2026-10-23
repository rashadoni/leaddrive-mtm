# Route & Field extended native audit — 2026-10-23

Scope: Samsung S23 Ultra / Android 16, installed public APK 3.11.52 / 1790, source `7bab34dfbe6a41a895051823e06fbf9181f3bc1e`. Existing manually authenticated Zeytun agent is preserved. No workday/visit/task/photo action was submitted. Existing `.impeccable.md` supplies the creator's audience, field-use context and visual direction. The `audit` skill guides this report; no blanket redesign is proposed.

## Findings

### P2 — full sync state is visually truncated at 130% text

Actual `today.png` from the large-text run shows the state as `Sinxronizasiya edi…`. `MTMobileApp/src/components/SyncStatusChip.tsx` gives the chip a 190 dp maximum and forces its label to one line. The complete state remains in the accessibility hint, but sighted employees should not need to open the sync centre to read it.

Correction: permit two label lines within the existing chip. This keeps the normal header, colours, controls and 44 dp minimum target. App version 3.11.53 is prepared. **NOT YET VERIFIED ON PHONE**; targeted hosted checks and a signed candidate are required before claiming a fix.

### P3 candidate — landscape Today uses a tall action column

The actual landscape screenshot shows bell, sync and refresh stacked beside the greeting, consuming much of the short viewport. The body scrolls, and no inaccessible action was demonstrated. Keep this as a follow-up composition improvement; do not mistake a scrollable first viewport for lost functionality. No landscape redesign is included in the correction.

## Retained automation failures

- Large-text Maestro navigation: PASS 98.707 s. Initial driver postflight: FAIL because it looked for screenshots above Maestro's timestamp/flow directory. All nine captures existed. Separate read-only evidence reconciliation PASS verified the original JUnit, same account and nine hashes; no UI replay. The collector now rejects missing, ambiguous and symlinked bundles.
- Landscape Maestro: FAIL 120.825 s while waiting for the clients search without scrolling. The hierarchy and one controlled swipe confirmed a full scrollable page and reachable search. The initial chat interpretation of search loss is superseded. All prior navigation commands completed; this is **not a full landscape Maestro PASS**. The flow now scrolls down to the search.

## Quality dimensions

| Dimension | Evidence / current assessment |
| --- | --- |
| Accessibility | Navigation and 130% text were exercised. Sync label truncation is confirmed. TalkBack and 200% text: NOT RUN; no WCAG conformance claim. |
| Responsive layout | Default five-tab walk PASS 101.994 s. Large-text navigation PASS with separately corrected artifact validation. Landscape search is reachable by scrolling; full corrected flow remains NOT RUN. |
| Theming | Daylight screenshots use the existing evergreen token system. Runtime dark-mode/contrast measurements are NOT RUN in this phase. |
| Performance | No native frame/load profile was captured. NOT RUN; do not invent a numerical score. |
| Visual anti-patterns | Observed screens keep clear tab destinations and status colours. The tall landscape header is a composition concern. No evidence supports a new blocking design defect. |

An overall /20 score is deliberately withheld because the measurements above do not cover all five dimensions. App-native keyboard/screen-reader behaviour, dark mode and tablets cannot be inferred from screenshots or desktop DOM rules.

## Positive evidence and actions

The profile, task ordering sheet and route month remain reachable with larger text. Native identity is preserved. The clients header scrolls with its list rather than taking a fixed frame. Temporary font/orientation/stay-awake settings were independently bounded and restored to exact original readbacks.

1. P2 `/adapt` — verify the two-line sync state on the signed candidate at 130% text.
2. P3 `/layout` — later compare the short-window Today action column with a compact arrangement while preserving every control.
3. `/polish` — inspect the candidate screenshots after the actual correction.

No synthetic phone GPS, signature, permission-denial or performance result is represented as a native pass. See the append-only session journal for API-layer negatives and remaining scope.
