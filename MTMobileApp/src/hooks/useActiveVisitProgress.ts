import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../services/api"
import { mediaUploadIdsForVisit } from "../services/media-outbox"
import { runMobileSync } from "../services/sync-engine"
import { hasQueuedVisitSignature, queueVisitSignature } from "../services/visit-signature"
import { signatureRequirementState, type SignatureCapture } from "../services/visit-signature-path"
import {
  EMPTY_VISIT_PHOTO_STATE,
  foldPhotoRead,
  needsServerPhotoRead,
  photosForVisit,
  visitPhotoCount,
  type VisitPhotoRead,
  type VisitPhotoState,
} from "../services/visit-photo-count"
import { toVisitWorkspace, type VisitRequirement, type VisitWorkspace } from "../services/visit-workspace"

/**
 * This app session's photos, per visit: direct uploads counted, and outbox ids
 * of the photos that went to the queue. Module-level on purpose: «Marşrut» and
 * «Ziyarətlər» each hold this hook, and a photo taken on one tab has to count
 * on the other before that tab reads the workspace again — even when the sync
 * already sent a queued one and the other tab never saw it in the outbox. A
 * restart forgets both, which is right — by then the server lists those photos
 * or the outbox still holds them.
 */
const sessionUploads = new Map<string, number>()
const sessionQueued = new Map<string, string[]>()

function sessionUploadsFor(visitId: string | null) {
  return visitId ? sessionUploads.get(visitId) ?? 0 : 0
}

function sessionQueuedFor(visitId: string) {
  return [...(sessionQueued.get(visitId) ?? [])]
}

/**
 * What the active visit already has, shared by «Marşrut» and «Ziyarətlər»: the
 * customer signature and the photo count. Both come from one workspace read
 * (GET /mobile/visits/[id]/workspace), not one per feature.
 *
 * Signature: the requirement comes from the visit's policy snapshot (manager
 * setting in the CRM, optional by default). The snapshot exists only once the
 * check-in reached the server, so a failed read is retried whenever the screen
 * hands over a fresh copy of the visit (it does after every sync).
 *
 * Photos: server list + media outbox + this session's photos, counted in
 * `services/visit-photo-count.ts`. Until 2026-09-14 «Foto: N» was local state
 * and the Galaxy S23 showed «Foto: 0» after a reinstall for a visit with 3
 * photos on the server. On each fresh copy of the visit the local queue is
 * re-read and shown at once; the server again only when the count held went
 * stale (a queued photo got uploaded, or a direct upload finished after the
 * last read). Until the first server read lands, photos already on the server
 * count as 0 — see the limits in that module.
 */
export function useActiveVisitProgress(visit: { id: string } | null) {
  const visitId = visit?.id ?? null
  const [requirements, setRequirements] = useState<VisitRequirement[] | null>(null)
  const [queued, setQueued] = useState(false)
  const [signedHere, setSignedHere] = useState(false)
  const [padVisible, setPadVisible] = useState(false)
  const [photoState, setPhotoState] = useState<VisitPhotoState>(EMPTY_VISIT_PHOTO_STATE)
  // Re-renders the count right after a direct upload, before the re-read lands.
  const [, setUploadTick] = useState(0)
  const photoStateRef = useRef<VisitPhotoState>(photoState)
  // Reads can overlap (a sync refresh and a just-taken photo); an older answer
  // must not overwrite a newer one. Photos order their reads in `foldPhotoRead`.
  const readSeq = useRef(0)
  const requirementsAppliedSeq = useRef(0)
  const currentVisitId = useRef<string | null>(visitId)
  currentVisitId.current = visitId

  useEffect(() => {
    requirementsAppliedSeq.current = readSeq.current
    setRequirements(null)
    setQueued(false)
    setSignedHere(false)
    setPadVisible(false)
  }, [visitId])

  const applyPhotos = useCallback((read: number, forVisitId: string, photoRead: VisitPhotoRead) => {
    if (currentVisitId.current !== forVisitId) return
    const next = foldPhotoRead(photoStateRef.current, forVisitId, read, photoRead)
    if (next === photoStateRef.current) return
    photoStateRef.current = next
    setPhotoState(next)
  }, [])

  const load = useCallback(async (force = false) => {
    if (!visitId) return
    const read = ++readSeq.current
    const uploadsAtReadStart = sessionUploadsFor(visitId)
    const sessionQueuedIds = sessionQueuedFor(visitId)
    const held = photosForVisit(photoStateRef.current, visitId)
    // The queue before the server: a photo uploaded in between is counted
    // twice until the next read instead of not at all.
    const queuedIds = await mediaUploadIdsForVisit(visitId).catch(() => held.queuedIds)
    const local = { queuedIds, uploadsAtReadStart, sessionQueuedIds }
    // Show the local queue now. The photo just queued usually means coverage is
    // bad, and the workspace read below can hang until its 20 s timeout; the
    // main button must not offer «Foto çək» again meanwhile.
    applyPhotos(read, visitId, { ...local, serverCount: null })
    if (!force && !needsServerPhotoRead(held, queuedIds, uploadsAtReadStart, sessionQueuedIds)) return
    const pending = await hasQueuedVisitSignature(visitId).catch(() => false)
    let workspace: VisitWorkspace | null = null
    try {
      const response = await api.getVisitWorkspace(visitId)
      if (response?.success && response.data?.visit) workspace = toVisitWorkspace(response.data.visit)
    } catch {}
    if (currentVisitId.current !== visitId) return
    setQueued(pending)
    if (workspace && read > requirementsAppliedSeq.current) {
      requirementsAppliedSeq.current = read
      setRequirements(workspace.requirements)
    }
    if (workspace) applyPhotos(read, visitId, { ...local, serverCount: workspace.photosCount })
  }, [applyPhotos, visitId])

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    load().catch(() => {})
    // `visit` identity changes after each sync; that is the retry signal.
  }, [load, visit])

  const state = signatureRequirementState(requirements)
  const signed = signedHere || queued || state.doneOnServer

  const save = useCallback(async (capture: SignatureCapture, signerName?: string) => {
    if (!visitId) return
    await queueVisitSignature(visitId, capture, signerName)
    setSignedHere(true)
    setPadVisible(false)
    runMobileSync().then(() => load(true)).catch(() => {})
  }, [load, visitId])

  /** A photo reached the server directly: count it now, then re-read the workspace. */
  const recordUpload = useCallback((forVisitId: string) => {
    sessionUploads.set(forVisitId, (sessionUploads.get(forVisitId) ?? 0) + 1)
    setUploadTick((tick) => tick + 1)
    loadRef.current().catch(() => {})
  }, [])

  /**
   * A photo went to the media outbox under `outboxId`: remember it for both
   * tabs, then re-read the queue (shown before any network call).
   */
  const recordQueued = useCallback((forVisitId: string, outboxId: string) => {
    sessionQueued.set(forVisitId, [...(sessionQueued.get(forVisitId) ?? []), outboxId])
    loadRef.current().catch(() => {})
  }, [])

  return {
    signature: {
      visible: Boolean(visitId) && state.visible,
      required: state.required,
      signed,
      /** Check-out must wait: the policy requires a signature and none was taken. */
      blocksCheckOut: state.required && !signed,
      padVisible,
      openPad: () => setPadVisible(true),
      closePad: () => setPadVisible(false),
      save,
    },
    photos: {
      /** «Foto: N»: server + queued + taken here since the last read. */
      count: visitPhotoCount(photosForVisit(photoState, visitId), sessionUploadsFor(visitId)),
      recordUpload,
      recordQueued,
    },
  }
}
