/**
 * A permission sheet may background and resume the activity. Resuming must
 * recheck an existing grant, not reopen a refused sheet. Keep this coordinator
 * outside the tracking effect so its cleanup cannot forget the attempt.
 */
export function createForegroundLocationPermission(input: {
  check: () => Promise<boolean>
  /** The app's own words before Android's sheet (location-disclosure.ts);
   * false keeps the sheet closed and counts as this principal's attempt. */
  disclose: () => Promise<boolean>
  request: () => Promise<boolean>
}) {
  let scope: string | null = null
  let generation = 0
  let attempted = false
  let requesting = false

  return {
    setScope(next: string | null) {
      if (next === scope) return
      scope = next
      generation += 1
      attempted = false
      // An already open Android sheet cannot be cancelled or transferred to
      // another principal. Its finally releases the shared in-flight slot.
    },
    async ensure(isCurrent: () => boolean): Promise<boolean> {
      const ticket = generation
      const current = () => scope !== null && generation === ticket && isCurrent()
      if (!current()) return false
      try {
        const granted = await input.check()
        if (!current()) return false
        if (granted) return true
        if (attempted || requesting) return false
        attempted = true
        requesting = true
        try {
          // The day may have ended, or the account changed, while the agent read.
          if (!await input.disclose() || !current()) return false
          const accepted = await input.request()
          return current() && accepted
        } finally {
          requesting = false
        }
      } catch {
        return false
      }
    },
  }
}
