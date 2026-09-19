import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * The organization can switch field contacts (doctors, pharmacists) off in
 * the web settings; the bootstrap carries it as `policies.fieldContactsEnabled`.
 * Every door the agent had into people must follow that one switch, read
 * through `fieldContactsEnabled()` so a missing answer keeps contacts shown.
 */
const read = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../src/screens", file), "utf8")

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  return from >= 0 && to > from ? source.slice(from, to) : ""
}

const POLICY_SELECTOR = "useBootstrapStore((state) => fieldContactsEnabled(state.data?.policies))"

describe("Müştərilər hub follows the contacts switch", () => {
  const base = read("base/RouteBaseScreen.android.tsx")

  it("reads the switch through the tolerant helper", () => {
    expect(base).toContain('import { fieldContactsEnabled } from "../../lib/field-contacts-policy"')
    expect(base).toContain(`const contactsEnabled = ${POLICY_SELECTOR}`)
  })

  it("renders the Təşkilatlar/Kontaktlar tabs only while contacts are enabled", () => {
    const header = between(base, "  const header = (", "\n  return (")
    const gated = between(header, "{contactsEnabled ? (", ") : null}")
    expect(gated).toContain("styles.segment")
    expect(gated).toContain('accessibilityRole="tab"')
    // Nothing tab-like outside the gate.
    expect(header.replace(gated, "")).not.toContain('accessibilityRole="tab"')
  })

  it("moves an agent off the contacts tab and shows places when disabled", () => {
    expect(base).toContain('if (!contactsEnabled && tab === "contacts") setTab("organizations")')
    expect(base).toContain('const visibleTab: BaseTab = contactsEnabled ? tab : "organizations"')
    expect(base).toContain('{visibleTab === "organizations"')
    expect(base).toContain("const active = TABS.find((item) => item.key === visibleTab) ?? TABS[0]")
  })
})

describe("Daha çox menu does not promise contacts when they are off", () => {
  const more = read("more/MoreScreen.tsx")

  it("swaps the customers subtitle for the places-only one", () => {
    expect(more).toContain(`const contactsEnabled = ${POLICY_SELECTOR}`)
    expect(more).toContain('bodyKey: "moreV2.baseBodyPlaces"')
    expect(more).toContain('bodyKey: "moreV2.baseBody"')
  })

  it("has the places-only subtitle in every language, without doctors or contacts", () => {
    const bodies = (["ru", "en", "az"] as const).map(
      (locale) => (mobileResources[locale].moreV2 as Record<string, string>).baseBodyPlaces,
    )
    expect(bodies).toEqual([
      "Найти клинику, аптеку или другую организацию",
      "Find a clinic, pharmacy, or another organization",
      "Klinika, aptek və ya başqa təşkilat tapın",
    ])
  })
})

describe("other doors into contacts", () => {
  it("organization card hides its contact list and the contact count on list cards", () => {
    const detail = read("base/RouteOrganizationDetailScreen.android.tsx")
    expect(detail).toContain(`const contactsEnabled = ${POLICY_SELECTOR}`)
    const gated = between(detail, "{contactsEnabled ? (", ") : null}")
    expect(gated).toContain("<Section title={copy.contacts}")
    expect(gated).toContain("openContact(contact)")
    expect(detail).toContain("{contactsEnabled ? copy.routeOnly : copy.routeOnlyPlaces}")

    const explorer = read("base/RouteOrganizationExplorerScreen.android.tsx")
    expect(explorer).toContain('{contactsEnabled && typeof item.contactsCount === "number" ?')
  })

  it("visit card shows no empty contact row when contacts are off, but keeps a linked one", () => {
    const visit = read("visit/VisitWorkspaceScreen.tsx")
    expect(visit).toContain(`const contactsEnabled = ${POLICY_SELECTOR}`)
    const gated = between(visit, "{contactsEnabled || data.contact?.name ? (", ") : null}")
    expect(gated).toContain("value={data.contact?.name || copy.noContact}")
  })

  it("manager workspace hides the contact transfer entry when contacts are off", () => {
    const manager = read("manager/ManagerWorkspaceScreen.android.tsx")
    expect(manager).toContain("const canTransferContacts = useBootstrapStore((state) => contactTransferAvailable(state.data?.policies))")
    const gated = between(manager, "{canTransferContacts ? (", ") : null}")
    expect(gated).toContain('navigation.navigate("ContactTransfer")')
    expect(manager.split('navigation.navigate("ContactTransfer")')).toHaveLength(2)
  })

  it("contact transfer screen reached anyway explains, loads no contacts and goes back", () => {
    const transfer = read("manager/ContactTransferScreen.android.tsx")
    expect(transfer).toContain("const transferAvailable = useBootstrapStore((state) => contactTransferAvailable(state.data?.policies))")
    expect(transfer).toContain("if (!transferAvailable || !sourceId) {")
    expect(transfer).toContain('t("contactTransfer.disabledNote")')
    const leave = between(transfer, "if (transferAvailable) return", "}, [navigation, transferAvailable])")
    expect(leave).toContain("navigation.goBack()")
    const notes = (["ru", "en", "az"] as const).map(
      (locale) => typeof (mobileResources[locale].contactTransfer as { disabledNote?: string }).disabledNote,
    )
    expect(notes).toEqual(["string", "string", "string"])
  })

  it("planner keeps the administrator-owned route taxonomy independent from the contacts directory", () => {
    const planning = read("planning/PlanningWorkspaceCore.android.tsx")
    expect(planning).toContain(`const contactsEnabled = ${POLICY_SELECTOR}`)
    expect(planning).toContain("plannableTargetTypes(")
    const policy = fs.readFileSync(path.resolve(__dirname, "../../src/lib/field-contacts-policy.ts"), "utf8")
    expect(policy).toContain("return configured")
  })
})
