# LeadDrive MTM — monorepo

Mobile companion + supporting tooling for the LeadDrive CRM **Route & Field** module (internal codename: **MTM** = Mobile Trade Management).

Backed up offsite as a private GitHub repository: <https://github.com/rashadrahimov/leaddrive-mtm>.

## What's in here

| Path | What it is | Status |
|---|---|---|
| `MTMobileApp/` | React Native (Android-only) field app. The shipping product. | Active — APKs built from here for production handovers |
| `MTM_SPEC.md` | Original product spec — read for context on the field-agent workflow | Reference |
| `TICKETS.md` | Manually-tracked work queue / backlog notes | Reference |
| `MTMobile/` | **Abandoned** RN scaffold from April 2026, pre-dates `MTMobileApp/` | Dead code — safe to ignore, kept for git history |
| `admin-panel/` | Early internal admin UI experiment | Superseded by `app.leaddrivecrm.org` settings — kept for git history |
| `backend/` | Early standalone Node backend experiment | Superseded by `leaddrive-v2` `/api/v1/*` routes — kept for git history |
| `docker-compose.yml` | Stack for the abandoned `backend/` (Postgres + Redis + Node) | Dead — do not run; backend lives at `app.leaddrivecrm.org` |
| `nginx/` | Reverse-proxy config for the abandoned `backend/` stack | Dead — superseded by prod nginx on the LeadDrive box |
| `app-release-crm.apk` | Older signed APK kept for diff / smoke-test | Snapshot, not the latest build |
| `deploy.sh` | Pre-MTMobileApp deploy script — references the abandoned `backend/` | Dead — do not run |

## Quick start (clone → first run)

The active product lives in `MTMobileApp/`. The instructions below cover everything new contributors need to do once per machine.

```bash
# 1. Clone
git clone git@github.com:rashadrahimov/leaddrive-mtm.git
cd leaddrive-mtm

# 2. Install pre-commit hook (gitleaks — secrets defense)
brew install gitleaks            # macOS; or: apt-get install gitleaks
cp ~/.claude/templates/gitleaks-pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# 3. React Native environment
#    Follow https://reactnative.dev/docs/set-up-your-environment for the
#    JDK / Android Studio / SDK setup. Confirm `adb devices` lists either
#    a physical phone or an emulator before going further.

# 4. Install JavaScript deps
cd MTMobileApp
npm install                      # or `yarn install`

# 5. Start Metro + run on Android
npm start                        # in one terminal
npm run android                  # in another — installs to running device/emulator
```

> See `MTMobileApp/README.md` for the per-app development workflow (Metro, hot-reload, package commands, versioning policy, APK output paths).

### API base URL — no `.env` needed

The Android app reads its backend URL at runtime from `ServerScreen` (the user types the tenant domain on first launch and the app validates it via `/api/v1/mtm/ping`). There is no build-time env file to configure — a fresh clone running on a test device should be pointed at `app.leaddrivecrm.org` (or any tenant subdomain like `mars.leaddrivecrm.org`) through that picker. The picked value persists in `AsyncStorage` and survives app restarts.

## Pre-commit hook — why it matters

The hook in `.git/hooks/pre-commit` runs `gitleaks git --pre-commit` on every commit and **fails closed** if it detects credentials, API keys, or anything matching a known secret pattern. Without it, an accidental `git commit -A` after pasting a `.env` snippet into a file would push the secret to GitHub.

The hook is a per-clone artifact (Git does not version `.git/hooks/`). You must install it once after cloning. The script template lives at `~/.claude/templates/gitleaks-pre-commit.sh` (canonical source — installed by Claude Code's global setup). If that path doesn't exist on your machine, copy the active hook from any sibling repo that already has it (e.g. `~/Documents/leaddrive-v2/.git/hooks/pre-commit`) — they should all be byte-identical to the template.

**Bypass** — emergency only, never for normal flow:

```bash
GITLEAKS_ALLOW_SKIP=1 git commit -m "..."
```

## Build — debug APK for handover

```bash
cd MTMobileApp/android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
# By convention copy to: ~/Desktop/leaddrive-mtm-debug-v<X.Y.Z>.apk
# where <X.Y.Z> matches MTMobileApp/package.json `version`.
```

## Build — release APK (signing, Play Store)

Signing keys are **not** stored in this repo (intentional). When iOS lands or a Play Store release is needed, set up a separate offsite store for:

- Android keystore (`android/app/<keystore>.jks`)
- Keystore passwords (`keystore.properties` — `.gitignore`'d)
- (Future) Apple Developer signing certificates + provisioning profiles

The current production flow ships debug APKs to operators directly; release/Play Store track is a roadmap item, not active.

## Test

```bash
cd MTMobileApp
npm test                         # Jest, runs against __tests__/
```

Add new tests under `MTMobileApp/__tests__/<area>/`. The repo already has working examples for `equipment/`, `i18n/`, `kpi/`, and `sync/` — copy the closest matching pattern.

## Branch model

- `main` — the only protected-when-Pro branch. Force-push and deletion are blocked **once GitHub Pro is enabled** on the account; today (Free tier + private repo) those protections aren't available via the API (`gh api -X PUT .../branches/main/protection` returns 403). Treat `main` as protected by convention: no force-push, no rewrite, every change goes through a normal commit + push.
- **Revisit this when:** a second contributor joins (upgrade to GitHub Pro ~$4/mo, then run `gh api -X PUT /repos/rashadrahimov/leaddrive-mtm/branches/main/protection -F allow_force_pushes=false -F allow_deletions=false ...`), OR the repo migrates to a GitHub org with Team plan.
- Feature branches OK; no PR ceremony required for solo work, but use them when changes span multiple sessions or touch more than ~10 files.

## When you make a code change

1. Edit + test locally
2. Stage specific files (avoid `git add -A` so the gitleaks hook can't be tricked by an unrelated `.env`)
3. `git commit` — hook scans the staged diff
4. `git push origin main`
5. (If shipping an APK) bump versions in `package.json` + `android/app/build.gradle`, rebuild, copy to `~/Desktop/leaddrive-mtm-debug-v<X.Y.Z>.apk`

## Where to find help

- Field-agent workflow / business context: `MTM_SPEC.md`
- React Native dev environment: <https://reactnative.dev/docs/set-up-your-environment>
- LeadDrive CRM backend (the API this app calls): `/Users/rashadrahimov/Documents/leaddrive-v2/`
- Offsite backup status / nested `.git` gotcha / branch protection: `~/.claude/projects/-Users-rashadrahimov-Documents-leaddrive-v2/memory/project_mtm_offsite_backup.md`
