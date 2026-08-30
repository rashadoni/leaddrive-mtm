import AsyncStorage from "@react-native-async-storage/async-storage"
import { routeFieldStorageKey } from "../runtime/route-field-profile"

const FIELD_DEVICE_ID_KEY = routeFieldStorageKey("device-id")
// The server rejects device headers over 128 bytes. Keep the persisted
// client-side validator no broader than that contract (`rf-` is 3 bytes).
const FIELD_DEVICE_ID_PATTERN = /^rf-[a-z0-9-]{20,125}$/

type KeyValueStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">

let fieldDeviceIdPromise: Promise<string> | null = null

function randomPart(random: () => number): string {
  return Math.floor(random() * 0x1_0000_0000).toString(36).padStart(7, "0")
}

/**
 * Opaque installation identity used only for server-side cohort assignment.
 * It is intentionally generated on-device rather than derived from an agent,
 * tenant, Android hardware identifier, or login token. It is not an
 * authentication credential.
 */
export function createFieldDeviceId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  return `rf-${now().toString(36)}-${randomPart(random)}-${randomPart(random)}-${randomPart(random)}`
}

export function isFieldDeviceId(value: unknown): value is string {
  return typeof value === "string" && FIELD_DEVICE_ID_PATTERN.test(value)
}

/**
 * Reads an existing per-installation id or creates one exactly once. Passing a
 * storage adapter is useful for focused tests; the production path uses the
 * app's AsyncStorage and keeps one in-memory promise to avoid concurrent
 * first-launch writes producing different headers.
 */
export async function readOrCreateFieldDeviceId(
  storage: KeyValueStorage = AsyncStorage,
  makeId: () => string = createFieldDeviceId,
): Promise<string> {
  const saved = await storage.getItem(FIELD_DEVICE_ID_KEY)
  if (isFieldDeviceId(saved)) return saved

  const created = makeId()
  await storage.setItem(FIELD_DEVICE_ID_KEY, created)
  return created
}

export function getFieldDeviceId(): Promise<string> {
  if (!fieldDeviceIdPromise) {
    fieldDeviceIdPromise = readOrCreateFieldDeviceId().catch((error) => {
      // A temporary AsyncStorage failure must not poison every later v1/v2
      // request in this process. The next request may retry the same persisted
      // installation identity; never generate a different id per request.
      fieldDeviceIdPromise = null
      throw error
    })
  }
  return fieldDeviceIdPromise
}

export const fieldDeviceIdStorageKey = FIELD_DEVICE_ID_KEY
