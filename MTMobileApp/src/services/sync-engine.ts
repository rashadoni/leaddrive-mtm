import { api } from "./api"
import { allOutboxOperations, flushOutbox } from "./outbox"
import { allMediaUploads, flushMediaOutbox, type MediaOutboxItem } from "./media-outbox"
import { pullAndApplySync } from "./sync-cache"
import { offlineScopeKey } from "./offline-scope"
import { useAuthStore } from "../store/auth"
import { useSyncStatusStore } from "../store/sync-status"

let activeSync: Promise<MobileSyncResult> | null = null

export type MobileSyncResult = {
  success: boolean
  sent: number
  deferred: number
  conflicted: number
  mediaSent: number
}

async function counts() {
  const [operations, media] = await Promise.all([allOutboxOperations(), allMediaUploads()])
  return {
    pending: operations.filter((item) => item.status === "pending").length,
    conflicts: operations.filter((item) => item.status === "conflict").length,
    mediaPending: media.length,
  }
}

export async function refreshSyncStatusCounts() {
  const next = await counts()
  useSyncStatusStore.getState().updateCounts(next)
  return next
}

async function performSync(): Promise<MobileSyncResult> {
  const agent = useAuthStore.getState().agent
  const scopeKey = offlineScopeKey(agent?.organizationId, agent?.id)
  if (!agent || !scopeKey) return { success: false, sent: 0, deferred: 0, conflicted: 0, mediaSent: 0 }

  const status = useSyncStatusStore.getState()
  await status.hydrate(scopeKey)
  useSyncStatusStore.getState().begin(scopeKey)

  let outbox = { sent: 0, deferred: 0, conflicted: 0 }
  let media = { sent: 0, deferred: 0 }
  try {
    outbox = await flushOutbox((operations) => api.syncPush(operations))
    await pullAndApplySync(agent.organizationId, agent.id, (since) => api.syncPull(since))
    media = await flushMediaOutbox((item: MediaOutboxItem) => api.uploadPhoto(item))
    const nextCounts = await counts()
    await useSyncStatusStore.getState().complete(scopeKey, nextCounts)
    return {
      success: true,
      sent: outbox.sent,
      deferred: outbox.deferred,
      conflicted: outbox.conflicted,
      mediaSent: media.sent,
    }
  } catch (error) {
    const nextCounts = await counts()
    useSyncStatusStore.getState().fail(
      scopeKey,
      error instanceof Error ? error.message : "SYNC_FAILED",
      nextCounts,
    )
    return {
      success: false,
      sent: outbox.sent,
      deferred: outbox.deferred,
      conflicted: outbox.conflicted,
      mediaSent: media.sent,
    }
  }
}

export function runMobileSync(): Promise<MobileSyncResult> {
  if (activeSync) return activeSync
  activeSync = performSync().finally(() => { activeSync = null })
  return activeSync
}

export async function markMobileOffline() {
  const nextCounts = await counts()
  useSyncStatusStore.getState().setOffline(nextCounts)
}
