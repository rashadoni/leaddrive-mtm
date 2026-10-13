# Overnight correction — mobile compatibility

The RU mock was shown before UI implementation. Product commit `c9db3c8e6570fe36136473a34648a6015990600d` adds the existing end-date field to TIME_CORRECTION, with RU/AZ/EN guidance. Other hourly requests remain same-day. Explicitly different end dates survive start-date edits and reselecting the correction kind. Same-day requests keep their existing body; overnight requests keep the same schema and immutable queued UUID/body through lost responses. The server owns timezone/DST/elapsed-duration and approval checks.

Required CI [38404385370](https://github.com/rashadoni/leaddrive-mtm/actions/runs/38404385370) on that exact product head passed218 Jest suites /1800 tests with1 existing todo, plus semantic TypeScript. Physical-device and emulator verification were NOT RUN by this task; signing/native build results are recorded separately in the session journal.

The `actual/` directory contains the three fictional React Native component trees downloaded from that CI artifact, their SHA256 hashes, code-native HTML previews and six PNGs (RU/AZ/EN ×1440/390). They are **HTML layout previews from actual CI component trees, not native-device screenshots or full E2E evidence**. The adapter preserves text inputs, labels, values and serialized styles. It cannot prove native font rendering, keyboard behavior, platform layout or device permissions. No real employee data, GPS, credentials or document photos appear in these artifacts.

All six previews fit their viewport and have controls at least48px high. RU1440 and EN390 were visually inspected. Existing form sections and request list remain. Capture used one Chromium after coordinator approval and resource preflight: availableRAM14117MiB/disk237GiB/memoryPSI0.

`render-ci-evidence.cjs <artifact-dir> <output-dir>` prepares the previews. Evidence is retained locally without changing the already verified PR head solely for documentation; the coordinator records final CI/merge/release references in the combined task journal.
