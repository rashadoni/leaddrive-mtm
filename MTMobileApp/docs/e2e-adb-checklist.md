# Device checklist (adb)

Field UX audit, task D1. Each line is a scenario that tests cannot see and
that was run on a real phone — Samsung S23 Ultra, Android 16, three-button
navigation — on 2026-09-13/14 with `scripts/e2e-adb.sh`. The measurement is
what counts, not the screenshot: take positions from `texts`/`frames`, not from
looking at a picture.

Run against any device the adb server can see:

```bash
MTMobileApp/scripts/e2e-adb.sh devices
MTMobileApp/scripts/e2e-adb.sh launch
MTMobileApp/scripts/e2e-adb.sh texts "Salam|Sinxron"
```

Two rules learned the hard way:

- **Measure unclipped frames.** `uiautomator dump` clips bounds. The tab bar
  that had collapsed to 28 px on Android (B18) looked merely "short" there;
  `frames` showed zero-height captions.
- **Airplane mode is not offline on Samsung.** It leaves Wi-Fi on. Check
  `network` before trusting an offline scenario; turn Wi-Fi off too.

The script never types a password and never changes system settings. Signing
in, rotating the phone and switching the network are done by the person
holding it.

| Area | Scenario | How to check | Expected | Last run |
|---|---|---|---|---|
| Tabs (B18) | Captions readable in AZ, RU, EN | `texts "Bu gün\|Сегодня\|Today"`, `frames` | Tab bar above the system bar, captions > 0 px high, each inside its button | 2026-09-13 ✓ |
| Rail, landscape (B19) | Phone rotated, 823 dp | person rotates; `texts` on the rail | Calendar in two panes; all rail captions whole (longest: RU «Календарь») | 2026-09-14 ✓ |
| Today (B7) | No route: one screen | `scroll-fit` on «Bu gün» | `fits` | 2026-09-14 ✓ (1786 / 1981) |
| Today (B7) | With a route: next stop above the fold | `texts "növbəti nöqtəsi\|Marşruta başla"` | Both above the viewport bottom | 2026-09-14 ✓ |
| Calendar (B5, B6) | Week strip, one open day, route status, «Marşrutu aç» | `texts "Planlaşdırılıb\|Marşrutu aç\|plan yoxdur"` | Status on a planned day, no «plan yoxdur» there; «Marşrutu aç» opens the Route tab (today only) | 2026-09-14 ✓ |
| Self planner (B8) | Monday, two stops, draft, publish | walk the planner; past days `enabled=false` in `dump` | «1 qaralama saxlanıldı.», then «1 marşrut dərc edildi.» | 2026-09-13 ✓ (writes to production — only with the owner's consent) |
| End day (B17) | Confirmation sheet, cancel | tap «Günü bitir», read `texts`, tap «İşə davam et» | App sheet, not a system Alert; workday continues | 2026-09-13 ✓ |
| Offline (B4) | Network off → chip, back on → synced | `watch-offline` while the person switches the network | «○ Oflayn» within 5 s; «✓ Sinxronizasiya edilib» right after reconnect | 2026-09-14 ✓ |
| No coordinates | Unplanned visit to a client without coordinates | select it, «Plansız ziyarətə başla» → «Giriş» | «Bu nöqtənin koordinatları yoxdur» with «Rəhbərə bildir»; no request is sent | 2026-09-13 ✓ |
| Sync centre | A rejected visit | open the chip | Title in words, client name, what to do; no raw server code | 2026-09-13 ✓ |
| Visits list | Names of clients without coordinates | `texts "ADV-DEMO"` | Full names; the coordinates pill under the address | 2026-09-13 ✓ |
| AZ casing | Initial of a name starting with «i» | a client named «i…» on «Ziyarətlər» | Avatar initial «İ» (U+0130), not «I» | 2026-09-14 ✓ (temporary client, deleted after) |
| RU plurals | GPS history counts | RU, «Мой GPS», step through days | «241 точка», «2 точки», «12 точек» | 2026-09-14 ✓ |
| GPS map (B16) | Tiles with the CARTO key | open «GPS tarixçəm», look at the map | Streets and buildings, no «API KEY REQUIRED» | 2026-09-13 ✓ |
| Status bar | Light screens | `shot`, sample the clock pixels on «Təqvim», «Daha çox» | Dark icons on light screens, light on green | 2026-09-13 ✓ |
| Sign-in (B20) | Fields and button without scrolling | person signs out and in; `texts` on the login form | Both fields and the button above the fold | not run — needs the agent's password |
