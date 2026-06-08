/**
 * SyncManager — orchestrates pull/push sync between the server and WatermelonDB.
 *
 * Flow (per sync cycle):
 *   1. Pull: GET /sync/pull?since=<cursor>&entities=all → applyPull → update WDB
 *   2. Push: fetch pending outbox ops → POST /sync/push → mark synced/failed
 *   3. Save new cursor (server timestamp from pull response)
 *
 * Auto-sync:
 *   - Every AUTO_SYNC_INTERVAL_MS (60 s)
 *   - On app foreground (call triggerSync() from AppState listener)
 *   - On network reconnect (netinfo listener)
 *
 * Error handling:
 *   - Network errors: retry next cycle (no status change for outbox)
 *   - Server conflict: mark outbox op 'failed', store server data
 *   - Server error: increment retry_count; after MAX_RETRIES → 'failed'
 *
 * Usage:
 *   syncManager.onStatusChange(status => updateUI(status))
 *   syncManager.startAutoSync()
 *   await syncManager.triggerSync()
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Q } from '@nozbe/watermelondb'
import { database } from '../db/database'
import { applyPull, type SyncPullChanges } from '../db/helpers/applyPull'
import type { OutboxOperation } from '../db/models/OutboxOperation'
import { api } from './api'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_LAST_SYNC  = '@mtm_last_sync'
const STORAGE_KEY_CLIENT_ID  = '@mtm_client_id'
const AUTO_SYNC_INTERVAL_MS  = 60_000   // 60 seconds
const MAX_RETRIES            = 5
const PUSH_BATCH_SIZE        = 100      // server limit
const SYNCED_PURGE_DAYS      = 7        // purge synced ops older than N days

export const backoffMs = (retryCount: number): number =>
  Math.min(30_000, 1_000 * 2 ** retryCount)

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface SyncState {
  status: SyncStatus
  lastSyncAt: Date | null
  pendingCount: number
  failedCount: number
  lastError: string | null
}

export type SyncStatusListener = (state: SyncState) => void

interface PushResult {
  operationId: string
  status: 'ok' | 'conflict' | 'error'
  serverId?: string
  serverData?: object
  error?: string
}

// ─── SyncManager class ────────────────────────────────────────────────────────

export class SyncManager {
  private _listeners: SyncStatusListener[] = []
  private _state: SyncState = {
    status: 'idle',
    lastSyncAt: null,
    pendingCount: 0,
    failedCount: 0,
    lastError: null,
  }
  private _autoSyncTimer: ReturnType<typeof setInterval> | null = null
  private _netinfoUnsubscribe: (() => void) | null = null
  /** Prevent concurrent syncs */
  private _isSyncing = false
  /** In-memory backoff gate: opId → earliest epoch ms for next push attempt */
  private _nextRetryAt = new Map<string, number>()

  // ── Initialization ─────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const rawLastSync = await AsyncStorage.getItem(STORAGE_KEY_LAST_SYNC)
    if (rawLastSync) {
      this._state.lastSyncAt = new Date(rawLastSync)
    }
    await this._refreshCounts()
    this._emit()
  }

  // ── Status subscriptions ───────────────────────────────────────────────────

  onStatusChange(listener: SyncStatusListener): () => void {
    this._listeners.push(listener)
    // Fire immediately with current state
    listener({ ...this._state })
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener)
    }
  }

  getState(): Readonly<SyncState> {
    return { ...this._state }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Trigger a sync cycle. Returns false if already syncing.
   * Safe to call from multiple places — concurrent calls are debounced.
   */
  async triggerSync(): Promise<boolean> {
    if (this._isSyncing) return false
    this._isSyncing = true
    this._setState({ status: 'syncing', lastError: null })

    try {
      await this._syncCycle()
      this._setState({ status: 'idle', lastError: null })
      return true
    } catch (err: any) {
      if (err?.message === 'SESSION_EXPIRED') {
        // Mid-session 401 — token revoked by the backend. Stop the
        // auto-sync timer immediately so we don't 401-storm on every
        // reconnect. The store logout already fired via the api callback.
        console.warn('[SyncManager] Session revoked — stopping auto-sync')
        this.stopAutoSync()
        this._setState({ status: 'idle', lastError: null })
        return false
      }
      const msg = err?.message ?? 'Sync failed'
      this._setState({ status: 'error', lastError: msg })
      console.error('[SyncManager] Sync cycle failed:', err)
      return false
    } finally {
      this._isSyncing = false
    }
  }

  /**
   * Start automatic sync: interval + network reconnect listener.
   */
  startAutoSync(): void {
    if (this._autoSyncTimer) return // already running

    this._autoSyncTimer = setInterval(() => {
      this.triggerSync().catch(console.error)
    }, AUTO_SYNC_INTERVAL_MS)

    // Netinfo listener — sync on reconnect
    this._wireNetinfo()
  }

  stopAutoSync(): void {
    if (this._autoSyncTimer) {
      clearInterval(this._autoSyncTimer)
      this._autoSyncTimer = null
    }
    if (this._netinfoUnsubscribe) {
      this._netinfoUnsubscribe()
      this._netinfoUnsubscribe = null
    }
  }

  /** Force-clear all pending/failed outbox ops (emergency reset). */
  async clearOutbox(): Promise<void> {
    await database.write(async () => {
      const all = await database.collections
        .get<OutboxOperation>('outbox_operations')
        .query()
        .fetch()
      await database.batch(all.map(r => r.prepareDestroyPermanently()))
    })
    await this._refreshCounts()
    this._emit()
  }

  // ── Sync cycle ─────────────────────────────────────────────────────────────

  private async _syncCycle(): Promise<void> {
    // Step 1: Pull
    const serverTimestamp = await this._pull()

    // Step 2: Push
    await this._push()

    // Step 3: Save cursor
    if (serverTimestamp) {
      await AsyncStorage.setItem(STORAGE_KEY_LAST_SYNC, serverTimestamp)
      this._state.lastSyncAt = new Date(serverTimestamp)
    }

    // Step 4: Purge old synced ops
    await this._purgeOldSynced()

    await this._refreshCounts()
    this._emit()
  }

  // ── Pull ───────────────────────────────────────────────────────────────────

  private async _pull(): Promise<string | null> {
    const rawLastSync = await AsyncStorage.getItem(STORAGE_KEY_LAST_SYNC)
    const since = rawLastSync ? new Date(rawLastSync).getTime() : undefined

    const agentRaw = await AsyncStorage.getItem('@mtm_agent')
    if (!agentRaw) {
      console.warn('[SyncManager] No agent in storage — skipping pull')
      return null
    }
    const agent = JSON.parse(agentRaw)

    const qs = new URLSearchParams()
    if (since) qs.set('since', String(since))
    qs.set('entities', 'routes,customers,skuCategories,skus,visits,orders,tasks')

    // Use the private request method via api singleton reflection — or call directly
    // We need authenticated fetch. Re-use the api client's token by calling the
    // dedicated sync pull endpoint.
    const resp = await (api as any).request(`/mobile/sync/pull?${qs.toString()}`)

    if (!resp.success) {
      throw new Error(`Pull failed: ${resp.error ?? 'unknown'}`)
    }

    const changes: SyncPullChanges = resp.changes ?? {}
    await applyPull(changes, {
      organizationId: agent.organizationId ?? '',
      agentId: agent.id,
    })

    return resp.timestamp as string ?? null
  }

  // ── Push ───────────────────────────────────────────────────────────────────

  private async _push(): Promise<void> {
    const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')

    // Fetch pending ops ordered by clientTimestamp (oldest first)
    const pendingOps = await outboxCol
      .query(Q.where('status', 'pending'))
      .fetch()

    if (pendingOps.length === 0) return

    const now = Date.now()
    const eligibleOps = pendingOps.filter(
      op => (this._nextRetryAt.get(op.operationId) ?? 0) <= now,
    )
    if (eligibleOps.length === 0) return

    const clientId = await this._getClientId()

    // Process in batches of PUSH_BATCH_SIZE
    for (let i = 0; i < eligibleOps.length; i += PUSH_BATCH_SIZE) {
      const batch = eligibleOps.slice(i, i + PUSH_BATCH_SIZE)
      await this._pushBatch(batch, clientId)
    }
  }

  private async _pushBatch(
    ops: OutboxOperation[],
    clientId: string,
  ): Promise<void> {
    // Mark all as 'syncing' before the request
    await database.write(async () => {
      await database.batch(
        ops.map(op =>
          op.prepareUpdate(r => {
            r.status = 'syncing'
          }),
        ),
      )
    })

    let results: PushResult[] = []

    try {
      const payload = {
        clientId,
        operations: ops.map(op => {
          const data = op.data ?? {}
          return {
            operationId: op.operationId,
            op: op.opType,
            entity: op.entity,
            data,
            clientTimestamp: op.clientTimestamp,
          }
        }),
      }

      const resp = await (api as any).request('/mobile/sync/push', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      results = Array.isArray(resp.results) ? resp.results : []
    } catch (err: any) {
      // Network error — revert to pending so next cycle retries
      await database.write(async () => {
        await database.batch(
          ops.map(op =>
            op.prepareUpdate(r => {
              r.status = 'pending'
            }),
          ),
        )
      })
      throw err  // propagate to abort this sync cycle
    }

    // Process results
    const resultMap = new Map(results.map(r => [r.operationId, r]))

    await database.write(async () => {
      const updates = ops.map(op => {
        const result = resultMap.get(op.operationId)

        if (!result) {
          // No result for this op — treat as error, retry
          return op.prepareUpdate(r => {
            r.status = r.retryCount >= MAX_RETRIES ? 'failed' : 'pending'
            r.retryCount = r.retryCount + 1
            r.lastError = 'No result from server'
          })
        }

        if (result.status === 'ok') {
          this._nextRetryAt.delete(op.operationId)
          return op.prepareUpdate(r => {
            r.status = 'synced'
            r.syncedAt = Date.now()
          })
        }

        if (result.status === 'conflict') {
          // Server wins — mark failed so the UI can surface the conflict
          this._nextRetryAt.delete(op.operationId)
          return op.prepareUpdate(r => {
            r.status = 'failed'
            r.lastError = result.error ?? 'Conflict with server data'
            // Store server data alongside for UI resolution
            r.data = { ...r.data, _serverData: result.serverData ?? null, _conflict: true }
          })
        }

        // status === 'error' — apply exponential backoff before next attempt
        const newRetryCount = op.retryCount + 1
        if (newRetryCount < MAX_RETRIES) {
          this._nextRetryAt.set(op.operationId, Date.now() + backoffMs(newRetryCount))
        } else {
          this._nextRetryAt.delete(op.operationId)
        }
        return op.prepareUpdate(r => {
          r.retryCount = newRetryCount
          r.lastError = result.error ?? 'Server error'
          r.status = newRetryCount >= MAX_RETRIES ? 'failed' : 'pending'
        })
      })

      await database.batch(updates)
    })
  }

  // ── Network detection (netinfo) ────────────────────────────────────────────

  private _wireNetinfo(): void {
    try {
      // Dynamic require so the app doesn't crash if netinfo isn't installed yet
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const NetInfo = require('@react-native-community/netinfo').default
      let wasOffline = false

      this._netinfoUnsubscribe = NetInfo.addEventListener(
        (state: { isConnected: boolean | null }) => {
          const isOnline = state.isConnected === true
          if (wasOffline && isOnline) {
            // Just came back online — trigger sync immediately
            console.log('[SyncManager] Network reconnected — triggering sync')
            this.triggerSync().catch(console.error)
          }
          wasOffline = !isOnline
        },
      )
    } catch {
      // @react-native-community/netinfo not installed yet
      console.warn('[SyncManager] netinfo not available — network-triggered sync disabled')
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async _getClientId(): Promise<string> {
    let id = await AsyncStorage.getItem(STORAGE_KEY_CLIENT_ID)
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
      await AsyncStorage.setItem(STORAGE_KEY_CLIENT_ID, id)
    }
    return id
  }

  private async _purgeOldSynced(): Promise<void> {
    const cutoff = Date.now() - SYNCED_PURGE_DAYS * 24 * 60 * 60 * 1000
    const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')
    const old = await outboxCol
      .query(
        Q.where('status', 'synced'),
        Q.where('synced_at', Q.lt(cutoff)),
      )
      .fetch()

    if (old.length > 0) {
      await database.write(async () => {
        await database.batch(old.map(r => r.prepareDestroyPermanently()))
      })
    }
  }

  private async _refreshCounts(): Promise<void> {
    const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')
    const [pending, failed] = await Promise.all([
      outboxCol.query(Q.where('status', Q.oneOf(['pending', 'syncing']))).fetchCount(),
      outboxCol.query(Q.where('status', 'failed')).fetchCount(),
    ])
    this._state.pendingCount = pending
    this._state.failedCount = failed
  }

  private _setState(partial: Partial<SyncState>): void {
    this._state = { ...this._state, ...partial }
    this._emit()
  }

  private _emit(): void {
    const snapshot = { ...this._state }
    this._listeners.forEach(l => {
      try { l(snapshot) } catch { /* listener errors must not break sync */ }
    })
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const syncManager = new SyncManager()
