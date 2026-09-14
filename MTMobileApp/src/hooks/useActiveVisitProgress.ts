import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../services/api"
import { mediaUploadIdsForVisit } from "../services/media-outbox"
import { runMobileSync } from "../services/sync-engine"
import { hasQueuedVisitSignature, queueVisitSignature } from "../services/visit-signature"
import { signatureRequirementState, type SignatureCapture } from "../services/visit-signature-path"
import {
  applyPhotoRead,
  EMPTY_VISIT_PHOTOS,
  needsServerPhotoRead,
  visitPhotoCount,
  type VisitPhotoRead,
  type VisitPhotoSnapshot,
} from "../services/visit-photo-count"
import { toVisitWorkspace, type VisitRequirement, type VisitWorkspace } from "../services/visit-workspace"

/**
 * Direct uploads of this app session, per visit. Module-level on purpose:
 * «Marşrut» and «Ziyarətlər» each hold this hook, and a photo taken on one tab
 * has to count on the other before that tab reads the workspace again. A
 * restart forgets it, which is right — by then the server lists those photos.
 */
const sessionUploads = new Map<string, number>()

function sessionUploadsFor(visitId: string | null) {
  return visitId ? sessionUploads.get(visitId) ?? 0 : 0
}

type HeldPhotos = { visitId: string | null; snapshot: VisitPhotoSnapshot }

/** The held count belongs to one visit; a different visit starts from nothing. */
function photosOf(held: HeldPhotos, visitId: string | null): VisitPhotoSnapshot {
  return held.visitId === visitId ? held.snapshot : EMPTY_VISIT_PHOTOS
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
 * Photos: server list + media outbox + this session's direct uploads, counted
 * in `services/visit-photo-count.ts`. Until 2026-09-14 «Foto: N» was local
 * state and the Galaxy S23 showed «Foto: 0» after a reinstall for a visit with
 * 3 photos on the server. On each fresh copy of the visit the local queue is
 * re-read; the server again only when the count held went stale (a queued
 * photo got uploaded, or a direct upload finished after the last read).
 */
export function useActiveVisitProgress(visit: { id: string } | null) {
  const visitId = visit?.id ?? null
  const [requirements, setRequirements] = useState<VisitRequirement[] | null>(null)
  const [queued, setQueued] = useState(false)
  const [signedHere, setSignedHere] = useState(false)
  const [padVisible, setPadVisible] = useState(false)
  const [heldPhotos, setHeldPhotos] = useState<HeldPhotos>({ visitId: null, snapshot: EMPTY_VISIT_PHOTOS })
  // Re-renders the count right after a direct upload, before the re-read lands.
  const [, setUploadTick] = useState(0)
  const heldPhotosRef = useRef<HeldPhotos>(heldPhotos)
  // Reads can overlap (a sync refresh and a just-taken photo); an older answer
  // must not overwrite a newer one.
  const readSeq = useRef(0)
  const photosAppliedSeq = useRef(0)
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
    if (currentVisitId.current !== forVisitId || read <= photosAppliedSeq.current) return
    photosAppliedSeq.current = read
    const next = { visitId: forVisitId, snapshot: applyPhotoRead(photosOf(heldPhotosRef.current, forVisitId), photoRead) }
    heldPhotosRef.current = next
    setHeldPhotos(next)
  }, [])

  const load = useCallback(async (force = false) => {
    if (!visitId) return
    const read = ++readSeq.current
    const uploadsAtReadStart = sessionUploadsFor(visitId)
    const held = photosOf(heldPhotosRef.current, visitId)
    // The queue before the server: a photo uploaded in between is counted
    // twice until the next read instead of not at all.
    const queuedIds = await mediaUploadIdsForVisit(visitId).catch(() => held.queuedIds)
    if (!force && !needsServerPhotoRead(held, queuedIds, uploadsAtReadStart)) {
      applyPhotos(read, visitId, { serverCount: null, queuedIds, uploadsAtReadStart })
      return
    }
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
    applyPhotos(read, visitId, { serverCount: workspace ? workspace.photosCount : null, queuedIds, uploadsAtReadStart })
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

  /** A photo went to the media outbox (or anything else changed): re-read what is needed. */
  const refresh = useCallback(() => {
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
      /** «Foto: N»: server + queued + uploaded here since the last read. */
      count: visitPhotoCount(photosOf(heldPhotos, visitId), sessionUploadsFor(visitId)),
      recordUpload,
      refresh,
    },
  }
}
