import { NativeModules, Platform } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "./api"
import { getFieldDeviceId } from "./field-device-id"
import { ROUTE_FIELD_PROFILE } from "../runtime/route-field-profile"

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
export async function registerPushToken(): Promise<PushStatus> {
  const checkedAt = new Date().toISOString()
  if (!nativeModule()) return remember({ state: "unsupported", checkedAt })
  const token = await currentPushToken()
  if (!token) return remember({ state: "noAddress", checkedAt })
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
    return remember({ state: "registered", serverSends, checkedAt })
  } catch {
    return remember({ state: "serverRefused", checkedAt })
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
  } catch {}
  const native = nativeModule()
  if (native) {
    try {
      await native.deleteToken()
    } catch {}
  }
}
