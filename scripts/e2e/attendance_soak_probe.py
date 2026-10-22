"""Bounded retries for read-only soak observations, never attendance writes.

The physical window and its maximum observation gap remain enforced separately.
A temporary transport failure is not a successful observation. Authorization,
identity, history and clock failures must reach the caller immediately.
"""
import time


TRANSIENT_ERRORS = frozenset({
    "Transport failure", "HTTP status 502", "HTTP status 503", "HTTP status 504",
})


def read_probe(read, *, sleep=time.sleep, on_retry=None):
    """At most three attempts; callers retain their own per-request timeout."""
    for attempt in range(3):
        try:
            return read()
        except RuntimeError as error:
            if str(error) not in TRANSIENT_ERRORS or attempt == 2:
                raise
            delay = 10 * (attempt + 1)
            if on_retry is not None:
                on_retry({"failedAttempt": attempt + 1, "retryAfterSeconds": delay,
                          "reason": str(error)})
            sleep(delay)
