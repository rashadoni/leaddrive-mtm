import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B21. The same visit appeared in two lists
 * with two different behaviours: in the organization card a row opens "Итог
 * визита" — arrival, departure, duration — and on the Visits screen, which
 * exists for this history, the identical row did nothing at all.
 */
const visits = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"),
  "utf8",
)
const organization = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteOrganizationDetailScreen.android.tsx"),
  "utf8",
)

describe("B21: a visit row opens from the screen that lists it", () => {
  it("opens the same destination the organization card already opened", () => {
    expect(organization).toContain('navigation.navigate("VisitWorkspace"')
    expect(visits).toContain('navigation.navigate("VisitWorkspace", { visitId: visit.id, name: visit.customer?.name ?? undefined })')
  })

  it("hands the handler to both lists, phone and tablet", () => {
    expect((visits.match(/<VisitRow visit=\{item\}/g) ?? [])).toHaveLength(2)
    expect((visits.match(/onPress=\{openVisitSummary\}|onPress=\{onOpenVisit\}/g) ?? [])).toHaveLength(2)
    expect(visits).toContain("onOpenVisit={openVisitSummary}")
  })

  it("stays a plain row when there is nothing to open", () => {
    // A queued visit can reach the list without a server id; a button that
    // does nothing is what this task is about in the first place.
    expect(visits).toContain('const openable = Boolean(onPress) && typeof visit.id === "string" && visit.id.length > 0')
    expect(visits).toContain("const Row: any = openable ? Pressable : View")
    expect(visits).toContain('if (typeof visit.id !== "string" || !visit.id) return')
  })

  it("says out loud that the row is a button, and what it is about", () => {
    expect(visits).toContain('accessibilityRole={openable ? "button" : undefined}')
    expect(visits).toContain("accessibilityLabel={openable ? `${visit.customer?.name || \"—\"}, ${status}` : undefined}")
    expect(visits).toContain('{openable ? <Icon name="chevron-forward"')
  })
})
