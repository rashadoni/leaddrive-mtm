import { AppState, DeviceEventEmitter, type AppStateStatus } from "react-native"
import { getOfflineScope, offlineScopeKey } from "./offline-scope"
import { refreshPushToken } from "./push-registration"

/** Emitted by FieldPushModule when Firebase hands this install a new token. */
export const PUSH_TOKEN_REFRESH_EVENT = "FieldPushTokenRefresh"

/**
 * While one principal is signed in — agent, office employee or manager, the
 * same app for all three — keep the server's address for this phone current:
 * once now, on every return to the foreground, and whenever Firebase rotates
 * the token. `refreshPushToken` decides whether anything is actually sent.
 *
 * Returns the stop function. After it, or once the session's scope is gone
 * (sign-out clears it), nothing more is registered for this principal.
 */
export function startPushTokenRefresh(principal: { organizationId?: string | null; id?: string | null }): () => void {
  const scope = offlineScopeKey(principal.organizationId, principal.id)
  if (!scope) return () => {}
  let stopped = false
  const stillCurrent = () => !stopped && getOfflineScope() === scope
  const refresh = (token?: string | null) => {
    if (!stillCurrent()) return
    void refreshPushToken(scope, stillCurrent, token).catch(() => {})
  }

  refresh()
  let previous: AppStateStatus = AppState.currentState
  const appState = AppState.addEventListener("change", (next) => {
    if (previous.match(/inactive|background/) && next === "active") refresh()
    previous = next
  })
  const rotation = DeviceEventEmitter.addListener(PUSH_TOKEN_REFRESH_EVENT, (event: { token?: unknown } | null) => {
    refresh(typeof event?.token === "string" ? event.token : null)
  })

  return () => {
    stopped = true
    appState.remove()
    rotation.remove()
  }
}
