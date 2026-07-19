import AsyncStorage from "@react-native-async-storage/async-storage"

export type SyncEntity = "routes" | "customers" | "visits" | "tasks" | "contacts"
export type SyncRecord = { id: string; [key: string]: unknown }
export type SyncState = { version: string | null; entities: Partial<Record<SyncEntity, SyncRecord[]>> }

function key(tenantId: string | null | undefined, agentId: string | null | undefined) {
  return `@mtm_sync_cache_v1:${tenantId || "unknown"}:${agentId || "unknown"}`
}

export async function readSyncCache(tenantId?: string | null, agentId?: string | null): Promise<SyncState> {
  const raw = await AsyncStorage.getItem(key(tenantId, agentId))
  if (!raw) return { version: null, entities: {} }
  try {
    const parsed = JSON.parse(raw) as SyncState
    return { version: parsed.version || null, entities: parsed.entities || {} }
  } catch {
    return { version: null, entities: {} }
  }
}

export async function applySyncChanges(
  tenantId: string | null | undefined,
  agentId: string | null | undefined,
  changes: Partial<Record<SyncEntity, { updated?: SyncRecord[]; deleted?: string[] }>>,
  version: string | null,
) {
  const state = await readSyncCache(tenantId, agentId)
  const entities = { ...state.entities }
  for (const entity of Object.keys(changes) as SyncEntity[]) {
    const delta = changes[entity]
    const current = new Map((entities[entity] || []).map((record) => [record.id, record]))
    for (const id of delta?.deleted || []) current.delete(id)
    for (const record of delta?.updated || []) current.set(record.id, record)
    entities[entity] = [...current.values()]
  }
  const next = { version, entities }
  await AsyncStorage.setItem(key(tenantId, agentId), JSON.stringify(next))
  return next
}

export async function clearSyncCache(tenantId?: string | null, agentId?: string | null) {
  await AsyncStorage.removeItem(key(tenantId, agentId))
}

export async function pullAndApplySync(
  tenantId: string,
  agentId: string,
  pull: (since: string | null) => Promise<{ timestamp?: string; changes?: Parameters<typeof applySyncChanges>[2] }>,
) {
  const previous = await readSyncCache(tenantId, agentId)
  const response = await pull(previous.version)
  const version = response.timestamp || previous.version || new Date().toISOString()
  return applySyncChanges(tenantId, agentId, response.changes || {}, version)
}
