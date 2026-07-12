import { useCallback, useRef } from "react"
import { AppState } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

/**
 * Keeps screen data fresh without a manual pull: a route or task created
 * in the admin panel shows up on the phone by itself. Re-runs `refresh`:
 *
 *  - every time the screen gains focus (initial mount, tab switch),
 *  - when the app returns from background while this screen is focused,
 *  - every `intervalMs` while the screen stays focused (default 60s).
 *
 * Pass a silent fetcher (one that doesn't flip loading flags on) — it runs
 * on a timer and must not flash spinners. Everything is torn down on blur,
 * so background tabs don't poll.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = 60_000) {
  // Ref keeps the interval bound to the latest callback without
  // re-registering focus effects when the fetcher identity changes.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useFocusEffect(
    useCallback(() => {
      refreshRef.current()
      const interval = setInterval(() => refreshRef.current(), intervalMs)
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") refreshRef.current()
      })
      return () => {
        clearInterval(interval)
        sub.remove()
      }
    }, [intervalMs])
  )
}
