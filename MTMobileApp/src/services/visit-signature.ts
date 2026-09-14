import { allOutboxOperations, enqueueOutboxOperation } from "./outbox"
import { isSignatureCaptureValid, type SignatureCapture } from "./visit-signature-path"

/**
 * A customer signature is a visit action like a photo requirement: it rides
 * the same outbox as check-in and check-out, so it is taken offline and sent
 * after the check-in it belongs to. The visit id is the client id the check-in
 * created, which the server keeps as the visit's own id.
 */
export async function queueVisitSignature(
  visitId: string,
  capture: SignatureCapture,
  signerName?: string,
) {
  if (!visitId) throw new Error("VISIT_SIGNATURE_NO_VISIT")
  if (!isSignatureCaptureValid(capture)) throw new Error("VISIT_SIGNATURE_INVALID")
  const name = signerName?.trim()
  return enqueueOutboxOperation({
    entity: "visitActions",
    op: "create",
    data: {
      visitId,
      actionKey: "SIGNATURE",
      status: "COMPLETED",
      evidence: {
        method: "drawn",
        svgPath: capture.svgPath,
        widthPx: capture.widthPx,
        heightPx: capture.heightPx,
        ...(name ? { signerName: name.slice(0, 120) } : {}),
        signedAt: new Date().toISOString(),
      },
    },
  })
}

/** A signature for this visit is still waiting in the outbox (not refused). */
export async function hasQueuedVisitSignature(visitId: string): Promise<boolean> {
  const operations = await allOutboxOperations()
  return operations.some((item) => (
    item.entity === "visitActions"
    && item.data?.visitId === visitId
    && item.data?.actionKey === "SIGNATURE"
    && item.status !== "conflict"
  ))
}
