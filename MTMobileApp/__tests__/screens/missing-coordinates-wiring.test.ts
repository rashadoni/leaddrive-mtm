import fs from "fs"
import path from "path"

const visitSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"),
  "utf8",
)
const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
  "utf8",
)

/**
 * B1 and B2 tails. The pure helpers were already covered, but the wiring was
 * not, and both defects lived exactly there: the right function existed and the
 * screen called it on the wrong branch, or did not call it at all.
 */
describe("a customer card with no coordinates", () => {
  it("offers the report action on the branch that actually fires", () => {
    // The owner's decision was: refuse the check-in AND offer to tell the
    // manager. The client-side test runs before the request, so if only the
    // server's answer opened the sheet, the action was unreachable.
    const branch = visitSource.slice(visitSource.indexOf("const performCheckIn"))
    const guard = branch.slice(0, branch.indexOf("const located"))
    expect(guard).toContain("if (!hasUsableCoordinates(customer))")
    expect(guard).toContain("showNoCoordinates(customer)")
    expect(guard).toContain('setCheckInIssue({ kind: "no-coordinates" })')
  })

  it("keeps the report action wired to sharing, not to a dead handler", () => {
    expect(visitSource).toContain("const showNoCoordinates = (customer: Customer)")
    expect(visitSource).toContain('confirmText: t("visit.reportToManager")')
    expect(visitSource).toContain("onConfirm: () => reportMissingCoordinates(customer)")
  })
})

describe("navigation to a route point", () => {
  it("does not treat 0,0 as a destination", () => {
    // A bare null check sent Google Maps to the Gulf of Guinea, which looks
    // like a real answer. Both the button's visibility and the URL it opens
    // ask the same question the check-in asks.
    const navigate = routeSource.slice(routeSource.indexOf("const handleNavigate"))
    const body = navigate.slice(0, navigate.indexOf("Linking.openURL"))
    expect(body).toContain("hasUsableCoordinates(point.customer)")
    expect(body).not.toContain("point.customer.latitude != null && point.customer.longitude != null")

    expect(routeSource).toContain(
      "const hasDirections = Boolean(point.customer.address || hasUsableCoordinates(point.customer))",
    )
  })

  it("still navigates by address when the card has one", () => {
    const navigate = routeSource.slice(routeSource.indexOf("const handleNavigate"))
    expect(navigate.slice(0, navigate.indexOf("Linking.openURL"))).toContain("point.customer.address")
  })
})
