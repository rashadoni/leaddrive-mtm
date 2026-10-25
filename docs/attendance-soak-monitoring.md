# Physical soak: live observation before another full-day attempt

The 24 October v11 attempt remains **FAIL**, independent acceptance **REFUSED**.
Both phone shell workers disappeared before the later user reboot. Their exit
cause is unknown. A separate recovery verified the three original queued claims;
it did not establish continuous isolation, expiry, or a successful full day.

`attendance_soak_monitor.py` replaces the controller's end-only phone read with
a bounded read every 30 seconds. It checks both exact worker argv/PIDs, boot ID,
the lease, separate worker heartbeats, and the latest invariant frame. A missing
transport, dead worker, stale frame, or a suspended host raises immediately and
records a redacted reason. HR polling continues separately every four minutes.
Full frame history, real elapsed time, expiry UI, replay and cleanup verification
remain mandatory; live `OBSERVED` records are never a release PASS.

Use `watch_android_window` **inside the new controller's existing try/finally**,
after the queued-actions/cold-start capture. Pass the actual `adb` wrapper which
honors `subprocess.run(timeout=...)`, recorded lease/PIDs/boot/start epoch, durable
`persist`, authenticated `server_sample`, operator `cancelled`, and `complete`
which reads actual before/after-expiry evidence. The completion callback is
bounded and cannot replace the full-window verifier. A failed probe must unwind
to exact-owned-UID restoration. Do not catch it and continue the old wait loop.

The watchdog now records its own heartbeat. Render a new worker for a new
attempt; never replace the worker/controller/source or receipts of v11. A new
controller must be rebound to a freshly verified test workday, current APKs,
runtime permissions, network scope, signed-in identity and fresh host credentials.
The old v11 controller's dated preconditions are not reusable as-is.

Qualification still required before another full day:

- Real short run with current device/ADB, then deliberate loss of either worker
  and transport, proving bounded rejection and exact network/display cleanup.
- Recovery that survives the intended USB/Mac failure mode. `setsid`/`nohup`
  alone is not evidence of Android process survival. If this cannot be proved,
  keep the physical isolation run supervised and do not promise independent
  cleanup while the phone is unreachable.
- Final expiry and replay on an uninterrupted real window. No accelerated clock
  or interrupted recovery substitutes for this gate.

No full-day attempt is started by this module or document. Local simulated-fault
checks prove control flow only, not physical Android survival or Time acceptance.
