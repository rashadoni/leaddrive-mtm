import { NativeModules } from "react-native"

type FieldNetworkNativeModule = {
  dropConnections?: (includeBusy: boolean, reason: string) => void
}

/**
 * What the app does when the server goes quiet.
 *
 * The HTTP client keeps a connection open and reuses it. A connection whose
 * other end is gone looks exactly like a slow one — nothing comes back, not
 * even an error — and the client kept sending into it. 7 October 2026: the
 * access screen retried every fifteen seconds for over twenty minutes, the
 * server logged nothing, and the same phone reached the same server in half a
 * second from outside the app. Restarting the app was the only cure.
 *
 * The client cannot tell silence from slowness; the app can count. One request
 * without an answer drops the connections nobody is using. A second one in a
 * row, with no answer to anything in between, is not a slow network any more:
 * every connection is closed and whatever is still waiting dials again.
 */
export const UNANSWERED_BEFORE_REDIAL = 2

let unanswered = 0

function drop(includeBusy: boolean, reason: string): void {
  try {
    const native = NativeModules.FieldNetwork as FieldNetworkNativeModule | undefined
    native?.dropConnections?.(includeBusy, reason)
  } catch {
    // Recovery help only: the request that asked has already failed by itself.
  }
}

/** The server answered — an error is an answer too. The connection works. */
export function noteAnswered(): void {
  unanswered = 0
}

/**
 * A request waited out its whole deadline and got nothing back.
 * Returns what was closed, for the tests and the log line.
 */
export function noteUnanswered(reason: string): "idle" | "all" {
  unanswered += 1
  if (unanswered < UNANSWERED_BEFORE_REDIAL) {
    drop(false, reason)
    return "idle"
  }
  unanswered = 0
  drop(true, reason)
  return "all"
}

/**
 * Close everything and dial again, without waiting for a second failure. For
 * the one place where the agent is locked out until an answer arrives.
 */
export function redial(reason: string): void {
  unanswered = 0
  drop(true, reason)
}

/**
 * The app is back on the screen. Whatever it kept from before may have died
 * while the phone slept or changed network; starting clean costs one handshake.
 */
export function dropIdleConnections(reason: string): void {
  drop(false, reason)
}

export function resetConnectionHealthForTests(): void {
  unanswered = 0
}
