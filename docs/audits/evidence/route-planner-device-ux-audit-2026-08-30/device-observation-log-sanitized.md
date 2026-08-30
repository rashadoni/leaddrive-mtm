# Sanitized device observation log

Audit date: 2026-08-30, Asia/Baku. Raw screenshots/UI XML containing client or staff names and addresses are intentionally excluded. Values below are exact UI text or bounds selected with narrow XPath expressions from UIAutomator dumps; no route/client identifiers are retained.

## Environment checkpoints

- `adb devices -l`: one authorized Samsung `SM-S918B` over USB; serial omitted.
- `ro.build.version.release=16`, SDK `36`, locale `ru-RU`.
- `wm size`: `1080x2316`; `wm density`: `450`.
- Package `com.mtmobileapp`: `versionName=3.0.1`, `versionCode=39`, `targetSdk=36`.
- Portrait configuration: `ROTATION_0`, approximately `384x824dp`.

## Sanitized state checkpoints

| Local time | Checkpoint | Device result |
|---|---|---|
| 20:15 | Review opened | 1 selected point; `09:00`; draft mode selected; publish disabled |
| 20:17 | Draft save | `Сохранён 1 черновик.`; save CTA disabled because no remaining changes |
| 20:18 | Exit and reopen | 1 selected point and `09:00` displayed again; HTTP response was not captured |
| 20:24 | Multi-client view | Existing published day showed 2 points; edit/reorder/delete disabled |
| 20:31 | Time toggle | `09:00 → 09:30 → 09:00` updated selected state without saving |
| 20:46 | Remove last point, instrumented rerun | Local selection became 0; review remained reachable; no client identity visible in committed frame |
| 20:47 | Attempt to save empty existing day | Inline warning was present; system dialog exposed two actions, `ОТМЕНА` and `ОЧИСТИТЬ` |
| 20:47 | Cancel destructive action | `ОТМЕНА` selected; full-draft deletion was not executed in this rerun |
| 20:48 | Restore and save | Original test point re-added at `09:00`; success text and no-changes text were present after save |
| 20:49 | Restore verification | Exit/reopen displayed 1 selected point and `09:00` |
| 20:50 | Final state | App returned to Calendar |

An earlier uninstrumented impression that no dialog appeared was discarded after the repeatable 20:47 checkpoint demonstrated the dialog. It is not used as a finding.

## Exact sanitized UI excerpts

The command shape used for these excerpts was:

```text
adb shell uiautomator dump /sdcard/<temporary>.xml
adb pull /sdcard/<temporary>.xml /private/tmp/<temporary>.xml
xmllint --xpath '<narrow selector>' /private/tmp/<temporary>.xml
```

Only the following non-identifying matches are retained:

```text
# After removing the last point locally, before save
Выбрано клиентов: 0 · дата уже задана|Пока пусто

# After tapping Save on the empty existing draft
dialog-buttons=2
ОТМЕНА bounds=[474,1204][701,1356]
ОЧИСТИТЬ bounds=[701,1204][974,1356]

# After cancelling, restoring the point and saving normally
success=Сохранён 1 черновик.|noChanges=Нет черновиков для сохранения.|dialogButtons=0

# After exit and reopen
Выбрано клиентов: 1 · дата уже задана|hour=09|minute00=00

# Final screen
Составить мой маршрут
```

The destructive-dialog screenshot is a crop of the device screenshot around the dialog. The crop removes the staff identity visible behind the modal; it does not alter dialog pixels or text.

## Ambiguous `Изменить` checkpoint

Pre-action UI text was `Выбрано клиентов: 1 · дата уже задана` with adjacent `Изменить`. One tap on `Изменить` opened step 1, whose heading was `Кто и когда`. The committed `03-ambiguous-edit-returned-to-step-1.png` documents the destination state, not the pre-action button.

## UIAutomator measurements

At density `450 dpi` (`2.8125 px/dp`):

- minute option `00`: bounds `90x90 px` ≈ `32x32 dp`;
- minute option `30`: bounds `90x90 px` ≈ `32x32 dp`;
- `Сегодня`: bounds `178x79 px` ≈ `63x28 dp`;
- date arrows: bounds `135x135 px` = `48x48 dp`;
- reorder/delete controls: about `123x124 px` ≈ `44x44 dp`;
- sticky footer primary action: height `141 px` ≈ `50 dp`.

## Scope controls observed

- No APK build or install.
- No app-data clear.
- No permission, locale, rotation, font-scale, or network changes.
- No production/deploy operation.
- No HTTP proxy or packet capture; persistence is reported only as visible state after exit/reopen, not as a captured server ACK.
