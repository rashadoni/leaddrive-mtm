import fs from "fs"
import path from "path"
import { toRouteContactDetail } from "../../src/services/route-contact-detail"

/**
 * A doctor's card lists where the doctor works. Until 2026-10-12 that line was
 * text: the owner, looking for «Клиент здесь» on his phone, opened a doctor,
 * saw the clinic's name and address — and had no way from there to the
 * clinic's own card, where its pin is corrected.
 */
const screen = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteContactDetailScreen.android.tsx"),
  "utf8",
)

describe("a doctor's workplace leads to the organization", () => {
  it("keeps the organization's id when the server names it, and none when it does not", () => {
    const detail = toRouteContactDetail({
      id: "contact-1",
      name: "Dr. Example",
      workplaces: [
        { id: "w1", customerId: "org-1", name: "North Clinic", isPrimary: true },
        // An older server says nothing about the organization.
        { id: "w2", name: "South Clinic" },
        { id: "w3", customerId: "   ", name: "Blank" },
        { id: "w4", customerId: null, name: "Null" },
      ],
    })
    expect(detail.workplaces.map((workplace) => workplace.customerId)).toEqual(["org-1", undefined, undefined, undefined])
    // Nothing else about the workplace changed.
    expect(detail.workplaces[0]).toMatchObject({ id: "w1", name: "North Clinic", isPrimary: true })
  })

  it("opens that organization's card, and only where there is an organization to open", () => {
    expect(screen).toContain('navigation.navigate("OrganizationDetail", { id: workplace.customerId as string, name: workplace.name || undefined })')
    expect(screen).toMatch(/const openOrganization = workplace\.customerId\s*\n\s*\? \(\) => navigation\.navigate/)
    expect(screen).toMatch(/\{openOrganization \? \(\s*\n\s*<Pressable/)
  })

  it("says what the button does in words, in every language of the app", () => {
    for (const label of ["Открыть организацию", "Məkanı aç", "Open the place"]) expect(screen).toContain(`openWorkplace: "${label}"`)
    expect(screen).toContain("<Text style={styles.workplaceOpenText}>{copy.openWorkplace}</Text>")
    // A finger-sized target, as every other button of the card.
    expect(screen).toContain("styles.workplaceOpen, { minHeight: touchTarget }")
  })
})
