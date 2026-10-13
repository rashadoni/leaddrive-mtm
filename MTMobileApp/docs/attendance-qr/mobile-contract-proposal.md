# Mobile branch QR — agreed contract

This proposal follows README task 4.7 literally: the optional rule controls verified branch presence; an absent or invalid QR does not erase or reject ordinary working time. GPS consent remains OFF. Coordinator reconciled this contract with CRM and showed the mock before mobile implementation.

- Existing `attendanceEnabled` plus default-false `attendanceBranchQrEnabled`; bootstrap advertises explicit `policies.attendanceBranchQrVersion:1` and `policies.agentPermissions.attendanceBranchQr:true` only when supported and own attendance permission is current. Omitted/false produces existing time behavior, no scanner control.
- Display controller: protected MTM branch QR issuance, short-lived 60-second signed token with tenant/branch/revision/nonce/server issue+expiry. No retired Workforce routes. Code never becomes a public URL, a notification, or a log entry. Mobile does not request a mint endpoint.
- Mark wire: optional `attendanceQr:{version:1,token:string|null}` beside `attendanceMark`, START/FINISH only. No QR on PAUSE/RESUME or return. FINISH from PAUSED always uses token:null; scanner closes during breaks. A new scan is required after RESUME.
- Canonical `serverData.attendanceQr` contains `{eventId,state,branch}`. State is VERIFIED, NOT_PROVIDED, EXPIRED, INVALID, BRANCH_CHANGED or REUSED; only VERIFIED carries `{id,name}` branch. Mobile stores this safe receipt before ACK, bound to scope/operation/workday/action; storage failure retains exact retry. No receipt never erases an earlier proof.
- A scan is provisional; no local “verified branch” from decoded text. Show branch name and verified state only from canonical server receipt. Mobile should never follow URLs embedded in arbitrary scans.
- Existing VisionCamera4.7.3 `useCodeScanner`, native `VisionCamera_enableCodeScanner=true`, QR-only code types. Camera foreground-only, permission explanation, one accepted scan per modal, no photo/video/recording/gallery upload. Account/tenant/mount guards fence callbacks and action submission. Cancel does not start a day.
- User explicitly confirms START or FINISH after scan. Bind raw token to that one immutable operation, hash it into the request identity. Unknown replies retry exact event/token, never auto-rescan or issue a new event UUID. Accepted replay works after token expiry because canonical receipt lookup precedes fresh verification. Unaccepted delayed delivery may preserve time with QR_NOT_VERIFIED.
- Store only safe canonical branch and verification outcome with the event, not raw QR. Shared screen must serve many employees: nonce use is unique per organization+employee+action (or exact event), not globally per organization. Server receipt timing controls expiry; phone time cannot extend it.
- Compatibility: missing QR/older app yields not verified (never “outside”); valid QR stays a separate signal from GPS assessment and existing definite-OUTSIDE policy. Report distinguishes GPS assessment, QR verified branch, and plain time.
- Required CI: multi-employee same code; repeated same event; token substitution with same event; cross-tenant/revision/disabled branch; expired/tampered token; issue/disable races; missing camera/cancel; foreground/account change; unknown send/restart; offline expiry; no GPS/native recording paths. Android build and physical scan required; local heavy gates prohibited on Contabo.

Official v4 references inspected 2026-10-13:
- https://raw.githubusercontent.com/margelo/react-native-vision-camera-v4-snapshot/main/docs/docs/guides/CODE_SCANNING.mdx
- https://raw.githubusercontent.com/mrousavy/react-native-vision-camera/v4.7.3/package/android/build.gradle

Coordinator agreed 2026-10-13: attendanceBranchQrEnabled=false by default, 60-second rotation, time preserved, separate QR fact from GPS, immutable START/FINISH proof, decode is not verification. Transport and receipt agreed as above. The original proposal to nest QR inside attendanceMark is superseded.
