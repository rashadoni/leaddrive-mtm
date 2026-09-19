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
    expect(base).toContain('const [tab, setTab] = useState<BaseTab>("contacts")')
    expect(base).toContain('TABS.find((item) => item.key === "organizations")!')
  })
})

describe("other doors into contacts", () => {
  it("keeps the clients directory in the global tabs and labels places honestly when contacts are off", () => {
    const navigator = fs.readFileSync(path.resolve(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"), "utf8")
    const base = read("base/RouteBaseScreen.android.tsx")
    expect(navigator).toContain('function ClientsStackNavigator()')
    expect(navigator).toContain('<ClientsStack.Screen name="ClientsHome" component={RouteBaseScreen} />')
    expect(navigator).toContain('Clients: ClientsStackNavigator')
    expect(navigator).toContain('name === "Clients" && !contactsEnabled ? "navV2.places"')
    expect(base).toContain("const canGoBack = (navigation.getState()?.index ?? 0) > 0")
    expect(base).not.toContain("const canGoBack = navigation.canGoBack()")
    const labels = (["ru", "en", "az"] as const).map(
      (locale) => (mobileResources[locale].navV2 as Record<string, string>).places,
    )
    expect(labels).toEqual(["Места", "Places", "Məkanlar"])
  })

  it("opens quick route planning with the selected client", () => {
    const detail = read("base/ContactDetailScreen.tsx")
    const planner = read("planning/PlanningWorkspaceCore.android.tsx")
    expect(detail).toContain('t("contacts.addToRoute")')
    expect(detail).toContain('initialTarget: { kind: "contact", id: detail.id, name: detail.name }')
    const organization = read("base/RouteOrganizationDetailScreen.android.tsx")
    expect(organization).toContain('initialTarget: { kind: "organization", id: detail.id, name: detail.name }')
    expect(organization).toContain('t("contacts.addToRoute")')
    expect(planner).toContain('targetId: initialTarget?.id')
    expect(planner).toContain('`${initialTarget.kind}:${initialTarget.id}`')
    expect(planner).toContain('quickTargetPending')
  })

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
