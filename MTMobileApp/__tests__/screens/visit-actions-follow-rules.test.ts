import fs from "fs"
import path from "path"
import { visitActionShown, type VisitRequirement } from "../../src/services/visit-workspace"
import { signatureRequirementState } from "../../src/services/visit-signature-path"

const route = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
const rule = (actionKey: string, mode: string): VisitRequirement => ({ actionKey, mode, done: false, waived: false })

/**
 * Owner, 7 October 2026, looking at a visit in progress: «раньше была
 * возможность брать подпись, её тут также нету. И ещё надо, чтоб эти функции
 * я мог включать и отключать для видимости и выбирать, обязательно или нет».
 *
 * The site already lets an organization set every visit action to required,
 * optional or hidden, and says of «optional»: the agent sees it and may do it.
 * The app drew the signature only when it was required and the presentation
 * always — so two of the three states did nothing on the phone.
 */
describe("which visit actions the organization's rules leave on screen", () => {
  it("shows an action that is required or optional, and not one that is hidden", () => {
    const workspace = { requirements: [rule("PHOTO", "REQUIRED"), rule("PRESENTATION", "OPTIONAL"), rule("VISIT_NOTE", "OPTIONAL")] }
    expect(visitActionShown(workspace, "PHOTO")).toBe(true)
    expect(visitActionShown(workspace, "PRESENTATION")).toBe(true)
    // Hidden actions never reach the app's list, so absent means hidden.
    expect(visitActionShown(workspace, "SIGNATURE")).toBe(false)
    expect(visitActionShown({ requirements: [rule("PHOTO", "OPTIONAL"), rule("SIGNATURE", "HIDDEN")] }, "SIGNATURE")).toBe(false)
  })

  it("hides nothing before the rules are known: offline, or before the check-in has synced", () => {
    expect(visitActionShown(null, "SIGNATURE")).toBe(true)
    expect(visitActionShown(undefined, "PHOTO")).toBe(true)
    expect(visitActionShown({ requirements: [] }, "PRESENTATION")).toBe(true)
  })

  it("agrees with the signature's own rule in every case", () => {
    const cases: VisitRequirement[][] = [
      [],
      [rule("PHOTO", "OPTIONAL")],
      [rule("SIGNATURE", "OPTIONAL")],
      [rule("SIGNATURE", "REQUIRED")],
      [rule("SIGNATURE", "HIDDEN"), rule("PHOTO", "OPTIONAL")],
    ]
    expect(cases.map((requirements) => visitActionShown({ requirements }, "SIGNATURE")))
      .toEqual(cases.map((requirements) => signatureRequirementState(requirements).visible))
  })
})

describe("the visit panel follows those rules", () => {
  const visit = route.slice(route.indexOf("function PointActionPanel("), route.indexOf("  if (!point) {", route.indexOf("function PointActionPanel(")))

  it("offers the signature when it is optional, not only when it is required", () => {
    expect(visit).toContain("const showSignature = signature.visible || signature.signed")
    expect(visit).not.toContain("signature.visible && (signature.required || signature.signed)")
    expect(visit).toContain("label={signature.required ? copy.takeSignatureRequired : copy.takeSignature}")
  })

  it("takes the presentation and the camera away only when they are hidden, and never once used", () => {
    expect(visit).toContain('const showPresentation = visitActionShown(workspace, "PRESENTATION") || presentationDone')
    expect(visit).toContain('const showPhoto = visitActionShown(workspace, "PHOTO") || photoCount > 0')
    expect(visit).toContain("{showPresentation ? (")
    expect(visit).toContain("{showPhoto ? (")
  })

  it("keeps «required» what stops the visit from being finished", () => {
    expect(visit).toContain('requirement.mode === "REQUIRED"')
    expect(visit).toContain("disabled={mutating || requiredRemaining.length > 0}")
  })
})
