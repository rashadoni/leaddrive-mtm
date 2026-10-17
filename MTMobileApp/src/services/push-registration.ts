import { NativeModules, Platform } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "./api"
import { getFieldDeviceId } from "./field-device-id"
import { ROUTE_FIELD_PROFILE } from "../runtime/route-field-profile"
import { getOfflineScope } from "./offline-scope"

/**
 * Telling the server where to deliver a push.
 *
 * Firebase gives the installation a token and rotates it on its own, so this
 * runs on every start and after every rotation. The server keeps one row per
 * token; signing out removes it, because the next person to sign in on this
 * phone must not receive the previous agent's notifications.
 *
 * Every failure here is silent to the flow. Push is a courtesy on top of a
 * field app that works without it; an agent standing in a clinic must never
 * see an error about a notification channel. Silent, however, is not the same
 * as invisible: the outcome is written down, and «Уведомления» shows it. A
 * phone that quietly has no address is exactly the state where everyone
 * believes notifications work and nobody receives them.
 */

const LAST_TOKEN_KEY = "@mtm_push_token_v1"
const STATUS_KEY = "@mtm_push_status_v1"
/** What this install last sent for one signed-in principal (org:agent). */
const SENT_KEY_PREFIX = "@mtm_push_sent_v1:"

/**
 * The server stamps `lastSeenAt` on every registration, so one a day tells a
 * phone that still has the app from one that stopped reporting. More often
 * says nothing new; a refusal waits as long, so a refused address is never
 * retried in a loop.
 */
export const PUSH_REREGISTER_AFTER_MS = 24 * 60 * 60 * 1000

export interface PushSentRecord {
  token: string
  outcome: "registered" | "refused"
  at: number
}

/** Whether this token is worth sending now: it is new for this principal, or the last word is a day old. */
export function pushRegistrationDue(record: PushSentRecord | null, token: string, now = Date.now()): boolean {
  if (!record || record.token !== token) return true
  return !(now - record.at < PUSH_REREGISTER_AFTER_MS)
}

async function readSent(scope: string): Promise<PushSentRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(`${SENT_KEY_PREFIX}${scope}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PushSentRecord
    return typeof parsed?.token === "string" && typeof parsed.at === "number" ? parsed : null
  } catch {
    return null
  }
}

async function writeSent(scope: string | null, record: PushSentRecord): Promise<void> {
  if (!scope) return
  try {
    await AsyncStorage.setItem(`${SENT_KEY_PREFIX}${scope}`, JSON.stringify(record))
  } catch {}
}

export type PushDeliveryState =
  /** The server holds this phone's address. */
  | "registered"
  /** Google gave this installation no address (no Play services, offline, blocked). */
  | "noAddress"
  /** We have an address; the server would not take it. */
  | "serverRefused"
  /** Not this platform. */
  | "unsupported"

export interface PushStatus {
  state: PushDeliveryState
  /** Whether the server itself can send. Absent until the server has answered. */
  serverSends?: boolean
  checkedAt: string
}

interface FieldPushNativeModule {
  getToken(): Promise<string | null>
  consumePendingToken(): Promise<string | null>
  deleteToken(): Promise<boolean>
}

function nativeModule(): FieldPushNativeModule | null {
  if (Platform.OS !== "android") return null
  const native = NativeModules.FieldPush as FieldPushNativeModule | undefined
  return native ?? null
}

export async function currentPushToken(): Promise<string | null> {
  const native = nativeModule()
  if (!native) return null
  try {
    // A token that arrived while the app was closed is used first: it is the
    // newer one, and Firebase will not repeat it.
    const pending = await native.consumePendingToken()
    if (pending) return pending
    return await native.getToken()
  } catch {
    return null
  }
}

async function remember(status: PushStatus): Promise<PushStatus> {
  try {
    await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status))
  } catch {}
  return status
}

/** What the last attempt found. Null before the first one. */
export async function lastPushStatus(): Promise<PushStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PushStatus
    return parsed?.state ? parsed : null
  } catch {
    return null
  }
}

/**
 * Register the current token with the server. Re-registering the same token
 * is cheap and keeps `lastSeenAt` fresh, so a device that stopped reporting
 * can be told apart from one that never had the app.
 */
export async function registerPushToken(knownToken?: string | null): Promise<PushStatus> {
  const checkedAt = new Date().toISOString()
  if (!nativeModule()) return remember({ state: "unsupported", checkedAt })
  const token = knownToken || await currentPushToken()
  if (!token) return remember({ state: "noAddress", checkedAt })
  // The principal this address is registered for, read before the request:
  // a sign-out meanwhile must not credit the next person with it.
  const scope = getOfflineScope()
  try {
    const deviceId = await getFieldDeviceId().catch(() => undefined)
    const response = await api.registerDeviceToken({
      token,
      platform: "android",
      deviceId: deviceId ?? null,
      appVersion: ROUTE_FIELD_PROFILE.apkVersion,
    }) as { data?: { pushEnabled?: boolean } } | undefined
    await AsyncStorage.setItem(LAST_TOKEN_KEY, token).catch(() => {})
    // An older server does not answer this at all; then we know the address
    // arrived and nothing more, which is what `undefined` says.
    const serverSends = typeof response?.data?.pushEnabled === "boolean" ? response.data.pushEnabled : undefined
    await writeSent(scope, { token, outcome: "registered", at: Date.now() })
    return remember({ state: "registered", serverSends, checkedAt })
  } catch (error) {
    // A session that ended is not the server refusing this address.
    if ((error as { message?: string })?.message !== "SESSION_EXPIRED") {
      await writeSent(scope, { token, outcome: "refused", at: Date.now() })
    }
    return remember({ state: "serverRefused", checkedAt })
  }
}

let refreshing: Promise<PushStatus | null> | null = null

/**
 * Keep the server's address for this phone current without asking it twice.
 *
 * Firebase rotates the token on its own; until 2026-10-17 the Android app
 * sent it only at sign-in and from «Bildirişlər», so after a rotation the
 * server kept a dead address until the next login. Called on start, on the
 * return to the foreground and on Firebase's refresh event. Sends only when
 * the token is new for this principal or its last word is a day old, and
 * never for a session that has ended (`stillCurrent`).
 */
export async function refreshPushToken(
  scope: string,
  stillCurrent: () => boolean,
  announcedToken?: string | null,
  now: () => number = Date.now,
): Promise<PushStatus | null> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    if (!nativeModule() || !stillCurrent()) return null
    const token = announcedToken || await currentPushToken()
    if (!token || !stillCurrent()) return null
    if (!pushRegistrationDue(await readSent(scope), token, now())) return null
    if (!stillCurrent() || getOfflineScope() !== scope) return null
    return registerPushToken(token)
  })()
  try {
    return await refreshing
  } finally {
    refreshing = null
  }
}

/**
 * On sign-out: tell the server to forget this address, then drop the token
 * itself so Firebase issues a fresh one for the next agent. The order
 * matters — deleting the token first would leave a row nobody can remove.
 */
export async function unregisterPushToken(): Promise<void> {
  let token: string | null = null
  try {
    token = await AsyncStorage.getItem(LAST_TOKEN_KEY)
  } catch {}
  if (!token) token = await currentPushToken()
  if (token) {
    try {
      await api.unregisterDeviceToken(token)
    } catch {}
  }
  try {
    await AsyncStorage.removeItem(LAST_TOKEN_KEY)
    await AsyncStorage.removeItem(STATUS_KEY)
    const scope = getOfflineScope()
    if (scope) await AsyncStorage.removeItem(`${SENT_KEY_PREFIX}${scope}`)
  } catch {}
  const native = nativeModule()
  if (native) {
    try {
      await native.deleteToken()
    } catch {}
  }
}
