import AsyncStorage from "@react-native-async-storage/async-storage"
import { routeFieldStorageKey } from "../runtime/route-field-profile"
import { readOfflineBootstrap, type OfflineBootstrapBinding } from "./bootstrap-offline-cache"
import type { VisitPhotoRead } from "./visit-photo-count"
import type { VisitRequirement } from "./visit-workspace"

export const VISIT_PROGRESS_CACHE_KEY = routeFieldStorageKey("active-visit-progress-v1")
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
// Upload counters belong to this JS process; they start at zero after a restart.
const processId = `${Date.now()}:${Math.random()}`
type Progress = { requirements: VisitRequirement[]; photosCount: number }
type Entry = Progress & { version: 1; binding: OfflineBootstrapBinding; visitId: string;
  storedAt: number; processId: string; photoRead: VisitPhotoRead }
let operations: Promise<unknown> = Promise.resolve()
let readSequence = 0, lastDecisionRead = 0
/** Shared by both visit screens, so an older response cannot revive a denial. */
export function nextVisitProgressRead(): number { return ++readSequence }
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = operations.then(work, work)
  operations = next.catch(() => {})
  return next
}
function validProgress(value: Progress): boolean {
  return Number.isSafeInteger(value.photosCount) && value.photosCount >= 0
    && Array.isArray(value.requirements) && value.requirements.every(r => r
      && typeof r.actionKey === "string" && typeof r.mode === "string"
      && typeof r.done === "boolean" && typeof r.waived === "boolean")
}
function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === "string")
}
export function clearVisitProgressCache(current = () => true, read = nextVisitProgressRead()): Promise<void> {
  return serial(async () => {
    if (current() && read >= lastDecisionRead) {
      lastDecisionRead = read
      await AsyncStorage.removeItem(VISIT_PROGRESS_CACHE_KEY)
    }
  })
}
/** Only a successful workspace response can replace the durable projection. */
export function rememberVisitProgress(binding: OfflineBootstrapBinding, visitId: string,
  progress: Progress, photoRead: VisitPhotoRead, current: () => boolean, read = nextVisitProgressRead()): Promise<void> {
  return serial(async () => {
    if (!current() || read < lastDecisionRead || !visitId || !validProgress(progress)
      || !Number.isSafeInteger(photoRead.uploadsAtReadStart) || photoRead.uploadsAtReadStart < 0
      || !validIds(photoRead.queuedIds) || !validIds(photoRead.sessionQueuedIds)) return
    lastDecisionRead = read
    const entry: Entry = { version: 1, binding: { ...binding }, visitId, storedAt: Date.now(), processId,
      photosCount: progress.photosCount,
      requirements: progress.requirements.map(({ actionKey, mode, done, waived }) => ({ actionKey, mode, done, waived })),
      photoRead: { serverCount: progress.photosCount, uploadsAtReadStart: photoRead.uploadsAtReadStart,
        queuedIds: [...photoRead.queuedIds], sessionQueuedIds: [...photoRead.sessionQueuedIds] } }
    await AsyncStorage.setItem(VISIT_PROGRESS_CACHE_KEY, JSON.stringify(entry))
  })
}
/** Cached progress is a local projection, never check-out authorization. */
export async function readOfflineVisitProgress(binding: OfflineBootstrapBinding, visitId: string,
  queuedIds: string[], current: () => boolean): Promise<(Progress & { photoRead: VisitPhotoRead }) | null> {
  // Reuse the actual bounded grant validation; a cached role is insufficient.
  const admission = await readOfflineBootstrap(binding, current)
  if (!admission || !current()) return null
  return serial(async () => {
    if (!current()) return null
    try {
      const raw = await AsyncStorage.getItem(VISIT_PROGRESS_CACHE_KEY)
      if (!raw || !current()) return null
      const entry = JSON.parse(raw) as Entry, now = Date.now()
      if (now >= admission.validUntil || !entry || entry.version !== 1 || entry.visitId !== visitId || !entry.binding
        || (Object.keys(binding) as Array<keyof OfflineBootstrapBinding>).some(key => entry.binding[key] !== binding[key])
        || !Number.isFinite(entry.storedAt) || now + 5_000 < entry.storedAt || now - entry.storedAt >= MAX_AGE
        || !validProgress(entry) || !entry.photoRead
        || !Number.isSafeInteger(entry.photoRead.uploadsAtReadStart) || entry.photoRead.uploadsAtReadStart < 0
        || !validIds(entry.photoRead.queuedIds) || !validIds(entry.photoRead.sessionQueuedIds)) return null
      return { requirements: entry.requirements, photosCount: entry.photosCount,
        photoRead: { serverCount: entry.photosCount,
          uploadsAtReadStart: entry.processId === processId ? entry.photoRead.uploadsAtReadStart : 0,
          sessionQueuedIds: entry.processId === processId ? entry.photoRead.sessionQueuedIds : [],
          queuedIds: [...new Set([...entry.photoRead.queuedIds, ...queuedIds])] } }
    } catch { return null }
  })
}
