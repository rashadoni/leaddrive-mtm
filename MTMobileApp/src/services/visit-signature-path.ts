/**
 * Pure half of the customer signature: turning finger strokes into the SVG
 * path the server stores, and reading whether the visit policy asks for one.
 * No React Native imports, so both are unit-tested.
 *
 * The server contract (leaddrive-v2 `MtmSignatureEvidence`) accepts
 * `svgPath` of 8..120 000 characters made only of M/L/Q/C/Z commands,
 * digits, dots, commas, spaces and minus, and a pad size of 50..4000 px.
 * Anything the pad produces is checked against the same limits here, so a
 * signature the agent saw accepted cannot bounce off the server later.
 */

export type SignaturePoint = [number, number]
export type SignatureStroke = SignaturePoint[]

export type SignatureCapture = {
  svgPath: string
  widthPx: number
  heightPx: number
}

export const SIGNATURE_PATH_MAX = 120_000
export const SIGNATURE_SIZE_MIN = 50
export const SIGNATURE_SIZE_MAX = 4000
/** Less ink than this is a tap or a slip, not a signature. */
export const SIGNATURE_MIN_INK_PX = 40

const PATH_PATTERN = /^[MLQCZmlqcz0-9.,\s-]+$/

function finitePoint(point: unknown): point is SignaturePoint {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
}

/** Total length of the drawn lines, in pad pixels. */
export function signatureInkLength(strokes: ReadonlyArray<ReadonlyArray<unknown>>): number {
  let total = 0
  for (const stroke of strokes) {
    const points = stroke.filter(finitePoint)
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
    }
  }
  return total
}

/**
 * Strokes in pad pixels → path in whole pixels. Points closer than a pixel to
 * the previous one are dropped (a finger reports many per pixel), a stroke of
 * one point becomes a short dot so it stays visible, and the pad size is
 * clamped to the server range. Returns null when there is nothing to keep or
 * the result would exceed the server limits.
 */
export function signatureCaptureFromStrokes(
  strokes: ReadonlyArray<ReadonlyArray<unknown>>,
  width: number,
  height: number,
): SignatureCapture | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  let maxX = 0
  let maxY = 0
  const parts: string[] = []
  for (const stroke of strokes) {
    const kept: SignaturePoint[] = []
    for (const point of stroke) {
      if (!finitePoint(point)) continue
      const x = Math.max(0, Math.round(point[0]))
      const y = Math.max(0, Math.round(point[1]))
      const last = kept[kept.length - 1]
      if (last && Math.abs(last[0] - x) < 1 && Math.abs(last[1] - y) < 1) continue
      kept.push([x, y])
    }
    if (kept.length === 0) continue
    if (kept.length === 1) kept.push([kept[0][0] + 1, kept[0][1]])
    for (const [x, y] of kept) {
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    parts.push(`M${kept[0][0]} ${kept[0][1]}${kept.slice(1).map(([x, y]) => `L${x} ${y}`).join("")}`)
  }
  if (parts.length === 0) return null
  const svgPath = parts.join(" ")
  const capture = {
    svgPath,
    widthPx: Math.min(SIGNATURE_SIZE_MAX, Math.max(SIGNATURE_SIZE_MIN, Math.round(width), maxX + 1)),
    heightPx: Math.min(SIGNATURE_SIZE_MAX, Math.max(SIGNATURE_SIZE_MIN, Math.round(height), maxY + 1)),
  }
  return isSignatureCaptureValid(capture) ? capture : null
}

export function isSignatureCaptureValid(capture: SignatureCapture | null | undefined): capture is SignatureCapture {
  if (!capture) return false
  const { svgPath, widthPx, heightPx } = capture
  return typeof svgPath === "string"
    && svgPath.length >= 8
    && svgPath.length <= SIGNATURE_PATH_MAX
    && PATH_PATTERN.test(svgPath)
    && Number.isInteger(widthPx) && widthPx >= SIGNATURE_SIZE_MIN && widthPx <= SIGNATURE_SIZE_MAX
    && Number.isInteger(heightPx) && heightPx >= SIGNATURE_SIZE_MIN && heightPx <= SIGNATURE_SIZE_MAX
}

export type SignatureRequirementState = {
  /** The visit policy was read; false while offline or before check-in syncs. */
  known: boolean
  /** Show the signature button. */
  visible: boolean
  /** Check-out waits for a signature. */
  required: boolean
  /** The server already holds a signature for this visit. */
  doneOnServer: boolean
}

/**
 * The workspace lists every action the visit's policy snapshot does not hide.
 * Signature is optional unless a manager made it required; a snapshot without
 * it means hidden (or a visit started before signatures existed — the server
 * would refuse one there too). With no snapshot yet the button stays available
 * as optional: an agent offline must still be able to take a signature.
 */
export function signatureRequirementState(
  requirements: ReadonlyArray<{ actionKey: string; mode: string; done: boolean }> | null | undefined,
): SignatureRequirementState {
  if (!requirements || requirements.length === 0) {
    return { known: false, visible: true, required: false, doneOnServer: false }
  }
  const signature = requirements.find((item) => item.actionKey === "SIGNATURE")
  if (!signature || signature.mode === "HIDDEN") {
    return { known: true, visible: false, required: false, doneOnServer: false }
  }
  return {
    known: true,
    visible: true,
    required: signature.mode === "REQUIRED",
    doneOnServer: signature.done,
  }
}
