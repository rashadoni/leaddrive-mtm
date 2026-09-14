import {
  SIGNATURE_PATH_MAX,
  isSignatureCaptureValid,
  signatureCaptureFromStrokes,
  signatureInkLength,
  signatureRequirementState,
} from "../../src/services/visit-signature-path"

/**
 * The customer signature is drawn with a finger and stored by the server as
 * an SVG path. These tests hold the app to the server's own limits
 * (leaddrive-v2 `MtmSignatureEvidence`) and to the owner's rule that a
 * signature is optional unless a manager requires it for the visit.
 */
describe("signature strokes to path", () => {
  it("builds whole-pixel move/line commands per stroke", () => {
    const capture = signatureCaptureFromStrokes(
      [
        [[10.2, 20.7], [30.4, 40.1], [50, 60]],
        [[100, 100], [120.6, 90.2]],
      ],
      600.4,
      240,
    )
    expect(capture).toEqual({
      svgPath: "M10 21L30 40L50 60 M100 100L121 90",
      widthPx: 600,
      heightPx: 240,
    })
  })

  it("drops points a finger repeats within a pixel and keeps a tap visible", () => {
    const capture = signatureCaptureFromStrokes([[[5, 5], [5.2, 5.3], [5.4, 4.8]], [[80, 80]]], 300, 200)
    expect(capture?.svgPath).toBe("M5 5L6 5 M80 80L81 80")
  })

  it("ignores broken points and returns null when nothing is left", () => {
    expect(signatureCaptureFromStrokes([[[Number.NaN, 1], ["x", 2] as any]], 300, 200)).toBeNull()
    expect(signatureCaptureFromStrokes([], 300, 200)).toBeNull()
  })

  it("clamps the pad size to the server range and covers every drawn point", () => {
    const capture = signatureCaptureFromStrokes([[[0, 0], [700, 30]]], 20, 20)
    expect(capture).toMatchObject({ widthPx: 701, heightPx: 50 })
    const huge = signatureCaptureFromStrokes([[[0, 0], [10, 10]]], 9000, 9000)
    expect(huge).toMatchObject({ widthPx: 4000, heightPx: 4000 })
  })

  it("refuses a path longer than the server accepts", () => {
    const points = Array.from({ length: 20_000 }, (_, index) => [index % 3000, (index * 7) % 3000])
    expect(signatureCaptureFromStrokes([points], 3000, 3000)).toBeNull()
    expect(isSignatureCaptureValid({ svgPath: "M1 1L2 2".padEnd(SIGNATURE_PATH_MAX + 1, " "), widthPx: 100, heightPx: 100 })).toBe(false)
  })

  it("accepts only characters the server pattern allows", () => {
    expect(isSignatureCaptureValid({ svgPath: "M1 1L20 20", widthPx: 100, heightPx: 100 })).toBe(true)
    expect(isSignatureCaptureValid({ svgPath: "M1 1<script>", widthPx: 100, heightPx: 100 })).toBe(false)
    expect(isSignatureCaptureValid({ svgPath: "M1 1L20 20", widthPx: 49, heightPx: 100 })).toBe(false)
  })

  it("measures ink so a slip does not count as a signature", () => {
    expect(signatureInkLength([[[0, 0], [3, 4]], [[10, 10]]])).toBe(5)
  })
})

describe("signature requirement from the visit policy", () => {
  it("is optional and available before the policy is known", () => {
    expect(signatureRequirementState(null)).toEqual({ known: false, visible: true, required: false, doneOnServer: false })
    expect(signatureRequirementState([])).toMatchObject({ visible: true, required: false })
  })

  it("follows the manager's setting", () => {
    const base = [{ actionKey: "PHOTO", mode: "OPTIONAL", done: false }]
    expect(signatureRequirementState([...base, { actionKey: "SIGNATURE", mode: "OPTIONAL", done: false }]))
      .toEqual({ known: true, visible: true, required: false, doneOnServer: false })
    expect(signatureRequirementState([...base, { actionKey: "SIGNATURE", mode: "REQUIRED", done: true }]))
      .toEqual({ known: true, visible: true, required: true, doneOnServer: true })
  })

  it("hides the button when the snapshot has no signature action", () => {
    expect(signatureRequirementState([{ actionKey: "PHOTO", mode: "REQUIRED", done: false }]))
      .toEqual({ known: true, visible: false, required: false, doneOnServer: false })
  })
})
