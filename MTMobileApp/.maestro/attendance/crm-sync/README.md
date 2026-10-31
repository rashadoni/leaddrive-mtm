# LeadDrive Time ↔ CRM (`attendance/crm-sync/`)

Each check pairs an action on one side with a check on the other, as in
`route-field/crm-sync/`. The phone runs under the employee who is already signed
in to LeadDrive Time. These flows never type a password. The CRM side is the
administrator's browser on «Personal» (`/mtm/attendance`).

Gate: `TIME_CRM_SYNC=owner-authorized-time-crm-sync-v1`. `TIME_EMPLOYEE` is the
signed-in employee's name; `home.yaml` refuses to act under anyone else.
`LOCALE` is the app language (`az`, `ru` or `en`). Requests and replies carry a
mark that starts with `RF-E2E-`.

The flows do not call `launchApp`, because without a permissions map it grants
every permission, and these flows run on the owner's own phone. The harness
brings the app to the front first:

```sh
adb shell am start --user 0 -n com.leaddrive.attendance/com.mtmobileapp.MainActivity
```

| Direction | Phone flow | CRM side |
|---|---|---|
| phone → CRM | `workday-step` with `TIME_STEP=start` | «Bu gün → İşdədir», with the start time; the day's journal shows phone time and server time |
| phone → CRM | `workday-step` with `pause`, then `resume` | «Fasilədə»; the report shows only how long the break lasted, never where |
| phone → CRM | `workday-step` with `finish` | «Çıxıblar»; time worked, net of the break |
| phone → CRM | `workday-step` with `return` (same day) | «İşdədir» again; the journal adds `REOPEN` and `RESUME` to the same day |
| phone → CRM | `request-submit` (`TIME_CRM_MARK`, `TIME_KIND`, `TIME_DATE`, `TIME_MONTH_OFFSET`) | «Qərarınızı gözləyir» row and the reviewer's bell |
| CRM → phone | «Rədd et» or «Təsdiqlə» with a reply (`RF-E2E-…`) | `request-status` (`TIME_EXPECT`, `TIME_REPLY`), then `inbox-notice` (`TIME_NOTICE`) |
| phone → CRM | `close-forgotten-day` (`TIME_END`, `TIME_EXPECT`) on a day left open since an earlier date | «Çıxış qeyd edilməyib» goes down by one; the decision and «was → became» appear in the timesheet |

A day's marks cannot be erased afterwards, because the journal is append-only
by design. Run `workday-step` only on a card the owner keeps for tests, and
finish the day at the end. Requests can be rejected or withdrawn, but they stay
in the history.

Android `hideKeyboard` presses Back, and Back closes the request form. The flows
close the keyboard by tapping the field's label instead (`labels.js`). The
reason field carries the same accessibility label, so the tap targets the text
above it. The clock sheet's hour and minute columns are nested scroll views:
`pick-time.yaml` swipes each column on its own.
