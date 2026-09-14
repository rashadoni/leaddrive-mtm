import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../services/api"
import { runMobileSync } from "../services/sync-engine"
import { hasQueuedVisitSignature, queueVisitSignature } from "../services/visit-signature"
import { signatureRequirementState, type SignatureCapture } from "../services/visit-signature-path"
import { toVisitWorkspace, type VisitRequirement } from "../services/visit-workspace"

/**
 * Signature state for the active visit, shared by «Marşrut» and «Ziyarətlər».
 *
 * The requirement comes from the visit's policy snapshot (manager setting in
 * the CRM, optional by default). The snapshot exists only once the check-in
 * reached the server, so a failed read is retried whenever the screen hands
 * over a fresh copy of the visit (it does after every sync) and stops once one
 * read succeeded.
 */
export function useVisitSignature(visit: { id: string } | null) {
  const visitId = visit?.id ?? null
  const [requirements, setRequirements] = useState<VisitRequirement[] | null>(null)
  const [queued, setQueued] = useState(false)
  const [signedHere, setSignedHere] = useState(false)
  const [padVisible, setPadVisible] = useState(false)
  const loadedFor = useRef<string | null>(null)
  const currentVisitId = useRef<string | null>(visitId)
  currentVisitId.current = visitId

  useEffect(() => {
    loadedFor.current = null
    setRequirements(null)
    setQueued(false)
    setSignedHere(false)
    setPadVisible(false)
  }, [visitId])

  const load = useCallback(async (force = false) => {
    if (!visitId) return
    if (!force && loadedFor.current === visitId) return
    const pending = await hasQueuedVisitSignature(visitId).catch(() => false)
    let next: VisitRequirement[] | null = null
    try {
      const response = await api.getVisitWorkspace(visitId)
      if (response?.success && response.data?.visit) next = toVisitWorkspace(response.data.visit).requirements
    } catch {}
    if (currentVisitId.current !== visitId) return
    setQueued(pending)
    if (next) {
      loadedFor.current = visitId
      setRequirements(next)
    }
  }, [visitId])

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

  return {
    visible: Boolean(visitId) && state.visible,
    required: state.required,
    signed,
    /** Check-out must wait: the policy requires a signature and none was taken. */
    blocksCheckOut: state.required && !signed,
    padVisible,
    openPad: () => setPadVisible(true),
    closePad: () => setPadVisible(false),
    save,
  }
}
