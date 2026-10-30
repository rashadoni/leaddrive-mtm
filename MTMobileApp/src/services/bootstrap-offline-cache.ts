import AsyncStorage from "@react-native-async-storage/async-storage"
import { routeFieldStorageKey } from "../runtime/route-field-profile"
import { toBootstrap, type BootstrapData } from "./bootstrap"

export const OFFLINE_BOOTSTRAP_KEY = routeFieldStorageKey("offline-bootstrap-v1")
export const OFFLINE_SESSION_KEY = routeFieldStorageKey("offline-login-session-v1")
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const CLOCK_TOLERANCE_MS = 5_000

/** A local login nonce, not a bearer credential. Rotated on every sign-in. */
export function newOfflineSessionId(): string {
  return [Date.now().toString(36), ...Array.from({ length: 4 }, () => Math.random().toString(36).slice(2))].join("-")
}

export interface OfflineBootstrapBinding {
  scope: string
  server: string
  deviceId: string
  sessionId: string
}

type Grant = {
  version: 1
  kind: "LOCAL_FIELD_DRAFTS"
  tenantId: string
  principalId: string
  deviceId: string
  issuedAt: string
  expiresAt: string
}

type Envelope = {
  version: 1
  binding: OfflineBootstrapBinding
  requestedAt: number
  lastSeenAt: number
  validUntil: number
  grant: Grant
  bootstrap: BootstrapData
}

// A late storage write must finish before a newer denial/logout clears it.
let operations: Promise<unknown> = Promise.resolve()
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation)
  operations = next.catch(() => {})
  return next
}

function grantFor(value: unknown, data: BootstrapData, binding: OfflineBootstrapBinding): Grant | null {
  const grant = value as Grant | null
  if (!grant || grant.version !== 1 || grant.kind !== "LOCAL_FIELD_DRAFTS"
    || data.routeFieldAccess !== "enabled" || data.principal?.role !== "AGENT"
    || !data.manifest?.modules.routeField.enabled || !data.capabilities.includes("FIELD_EXECUTE")
    || grant.tenantId !== data.tenant?.id || grant.principalId !== data.principal.id
    || binding.scope !== `${grant.tenantId}:${grant.principalId}` || grant.deviceId !== binding.deviceId
    || !binding.server || !binding.sessionId || !binding.deviceId) return null
  const issued = Date.parse(grant.issuedAt), expires = Date.parse(grant.expiresAt)
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_AGE_MS) return null
  // Persist only the declared contract, never arbitrary server fields/tokens.
  return { version: 1, kind: "LOCAL_FIELD_DRAFTS", tenantId: grant.tenantId,
    principalId: grant.principalId, deviceId: grant.deviceId,
    issuedAt: grant.issuedAt, expiresAt: grant.expiresAt }
}

export function clearOfflineBootstrap(): Promise<void> {
  return serial(() => AsyncStorage.removeItem(OFFLINE_BOOTSTRAP_KEY))
}

export function rememberOfflineBootstrap(data: BootstrapData, value: unknown,
  binding: OfflineBootstrapBinding | null, current: () => boolean, now = Date.now()): Promise<void> {
  return serial(async () => {
    if (!current()) return
    const grant = binding ? grantFor(value, data, binding) : null
    if (!grant || !binding) { await AsyncStorage.removeItem(OFFLINE_BOOTSTRAP_KEY); return }
    const bootstrap: BootstrapData = { ...data, workday: null,
      manifest: data.manifest ? { ...data.manifest, modules: { ...data.manifest.modules,
        workforceHrm: { enabled: false, scopeVersion: null }, commercial: { enabled: false, scopeVersion: null } } } : null,
      policies: { ...data.policies, attendanceMarkVersion: undefined, attendanceBranchQrVersion: undefined,
        agentPermissions: { ...data.policies.agentPermissions, attendanceRequests: false,
          attendanceWorkday: false, attendanceLocation: false, attendanceInstallation: false } } }
    // Anchor to request start: a slow/suspended response must not extend the
    // server's maximum duration. Local wall-clock offset does not matter.
    const validUntil = now + Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt)
    const lastSeenAt = Date.now()
    if (lastSeenAt + CLOCK_TOLERANCE_MS < now || lastSeenAt >= validUntil) {
      await AsyncStorage.removeItem(OFFLINE_BOOTSTRAP_KEY)
      return
    }
    const envelope: Envelope = { version: 1, binding, grant, requestedAt: now, lastSeenAt, validUntil, bootstrap }
    await AsyncStorage.setItem(OFFLINE_BOOTSTRAP_KEY, JSON.stringify(envelope))
  })
}

export function readOfflineBootstrap(binding: OfflineBootstrapBinding | null, current: () => boolean,
  now = Date.now()): Promise<{ data: BootstrapData; validUntil: number } | null> {
  return serial(async () => {
    if (!binding || !current()) return null
    const raw = await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)
    if (!raw || !current()) return null
    try {
      const envelope = JSON.parse(raw) as Envelope
      const data = toBootstrap(envelope.bootstrap)
      const grant = grantFor(envelope.grant, data, binding)
      const saved = envelope.binding
      if (!grant || envelope.version !== 1 || !saved
        || (Object.keys(binding) as Array<keyof OfflineBootstrapBinding>).some(key => saved[key] !== binding[key])
        || !Number.isFinite(envelope.requestedAt) || !Number.isFinite(envelope.lastSeenAt)
        || !Number.isFinite(envelope.validUntil) || now >= envelope.validUntil
        || now + CLOCK_TOLERANCE_MS < envelope.lastSeenAt || now + CLOCK_TOLERANCE_MS < envelope.requestedAt
        || envelope.lastSeenAt + CLOCK_TOLERANCE_MS < envelope.requestedAt || envelope.lastSeenAt >= envelope.validUntil
        || envelope.validUntil !== envelope.requestedAt + Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt)) {
        await AsyncStorage.removeItem(OFFLINE_BOOTSTRAP_KEY)
        return null
      }
      if (!current()) return null
      envelope.lastSeenAt = Math.max(envelope.lastSeenAt, now)
      await AsyncStorage.setItem(OFFLINE_BOOTSTRAP_KEY, JSON.stringify(envelope))
      if (!current()) return null
      // A cached field draft permission never confirms an HRM workday.
      return { data: { ...data, workday: null, routeFieldAccess: "offline-enabled" }, validUntil: envelope.validUntil }
    } catch {
      await AsyncStorage.removeItem(OFFLINE_BOOTSTRAP_KEY)
      return null
    }
  })
}
