import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"
import {
  newTeamMessageId,
  recipientInitials,
  teamMessageFailure,
  teamMessageRequest,
  toTeamRecipients,
} from "../../src/services/team-message"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const screen = read("screens/manager/ManagerTeamMessageScreen.android.tsx")
const workspace = read("screens/manager/ManagerWorkspaceScreen.android.tsx")
const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
const managerApi = read("services/manager-api.ts")

/**
 * «Komandaya yaz» (owner-approved mockup, 2026-10-17): from «Komanda» the
 * manager writes to the whole team or to one employee. The team is the
 * server's list (leaddrive-v2 /api/v1/mtm/mobile/manager/messages, the
 * manager's scope); the phone never adds a recipient of its own.
 */
describe("the manager writes to the team", () => {
  it("Komanda: «Komandaya yaz» and «Marşrut yarat» side by side, one height", () => {
    const pair = workspace.slice(workspace.indexOf("<View style={styles.homeActions}>"), workspace.indexOf("{loadError && ("))
    expect(pair.indexOf('testID="manager-home-write-team"')).toBeGreaterThan(-1)
    expect(pair.indexOf('testID="manager-home-write-team"')).toBeLessThan(pair.indexOf('testID="manager-home-create-route"'))
    expect(pair).toContain('onPress={() => navigation.navigate("ManagerTeamMessage")}')
    expect(pair).toContain('t("managerShell.writeTeam")')
    // An even pair: both stretch the row, so they are one width and one height.
    expect(workspace).toContain('homeActions: { flexDirection: "row", gap: fieldTheme.space.sm },')
    expect(workspace).toContain("flex: 1,\n    minHeight: 52,")
    // One border for both: the flex basis counts it (4 dp apart on the S23, 2026-10-18).
    const homeAction = workspace.slice(workspace.indexOf("  homeAction: {"), workspace.indexOf("  writeTeam: {"))
    expect(homeAction).toContain("borderWidth: 2,")
    expect(workspace).toContain("  writeTeam: { backgroundColor: fieldTheme.color.surface },")
    expect(workspace).toContain("  createRoute: { backgroundColor: fieldTheme.color.primary },")
    expect(workspace.slice(workspace.indexOf("  writeTeam: {"), workspace.indexOf("  createRouteText: {"))).not.toContain("borderWidth")
  })

  it("keeps «Göndər» above the keyboard", () => {
    // Android 16 no longer shrinks the window for the keyboard (S23, 2026-10-18).
    expect(screen).toContain('<KeyboardAvoidingView style={styles.root} behavior="padding">')
    expect(screen).not.toContain("<View style={styles.root}>")
  })

  it("is a screen of the manager's stack only", () => {
    const managerBlock = navigator.slice(navigator.indexOf("{managerShell ? ("), navigator.indexOf(") : hasServer ? ("))
    expect(managerBlock).toContain('<Stack.Screen name="ManagerTeamMessage" component={ManagerTeamMessageScreen} />')
    expect(navigator.match(/name="ManagerTeamMessage"/g)).toHaveLength(1)
  })

  it("asks the server whom to write to and sends only to that list", () => {
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/messages", { signal })')
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/messages", { method: "POST", body: JSON.stringify(data) })')
    expect(screen).toContain("const team = toTeamRecipients(response)")
    expect(screen).toContain("recipients.find((agent) => agent.id === selectedId)")
    expect(screen).toContain("await managerApi.sendTeamMessage(request)")
    // Someone who left the team meanwhile: the list is asked again.
    expect(screen).toContain('if (reason === "notInTeam" || reason === "noRecipients") loadTeam().catch(() => {})')
  })

  it("sends a message again under the same id; a changed text or recipient is a new message", () => {
    // Made on opening, on any change of text/recipient, and on «Yenə yaz» — never on a retry.
    expect(screen.match(/newTeamMessageId\(\)/g)).toHaveLength(3)
    expect(screen).toContain("const messageId = useRef(newTeamMessageId())")
    expect(screen).toContain("const onText = changeMessage(setText)")
    expect(screen).toContain("const onSelect = changeMessage(setSelectedId)")
    expect(screen).toContain("const request = teamMessageRequest(target, text, messageId.current)")
  })

  it("keeps the text when sending failed and says why", () => {
    const send = screen.slice(screen.indexOf("const send = async () => {"), screen.indexOf("const writeAgain = () => {"))
    expect(send).not.toContain("setText(")
    expect(screen).toContain('testID="team-message-error"')
    expect(screen).toContain('t("teamMessage.notSentTitle")')
  })

  it("builds the request from the chosen target", () => {
    expect(teamMessageRequest({ to: "TEAM" }, "  Sabah 9:00  ", "team-message-1")).toEqual({ to: "TEAM", body: "Sabah 9:00", clientMessageId: "team-message-1" })
    expect(teamMessageRequest({ to: "AGENT", agentId: "a-1" }, "Salam", "team-message-1")).toEqual({ to: "AGENT", agentId: "a-1", body: "Salam", clientMessageId: "team-message-1" })
    expect(teamMessageRequest(null, "Salam", "team-message-1")).toBeNull()
    expect(teamMessageRequest({ to: "TEAM" }, "   ", "team-message-1")).toBeNull()
  })

  it("reads the server's list and drops a row without an id or a name", () => {
    expect(toTeamRecipients({ data: { recipients: [
      { id: "a-1", name: "Aysel Quliyeva", role: "AGENT" },
      { id: "", name: "No id" },
      { id: "a-2", name: "  " },
      null,
    ] } })).toEqual([{ id: "a-1", name: "Aysel Quliyeva" }])
    expect(toTeamRecipients({ data: {} })).toEqual([])
    expect(toTeamRecipients(null)).toEqual([])
  })

  it("names each refusal of the server", () => {
    const failure = (code: string) => teamMessageFailure(Object.assign(new Error("x"), { code }))
    expect(failure("MTM_TEAM_MESSAGE_RECIPIENT_FORBIDDEN")).toBe("notInTeam")
    expect(failure("MTM_TEAM_MESSAGE_NO_RECIPIENTS")).toBe("noRecipients")
    expect(failure("MTM_TEAM_MESSAGE_EMPTY")).toBe("empty")
    expect(failure("TENANT_CAPABILITY_DISABLED")).toBe("notEnabled")
    expect(failure("MTM_MOBILE_CAPABILITY_REQUIRED")).toBe("noRight")
    expect(teamMessageFailure(new Error("Network request failed"))).toBe("offline")
    expect(teamMessageFailure(new Error("REQUEST_TIMEOUT"))).toBe("offline")
    expect(teamMessageFailure(new Error("SESSION_EXPIRED"))).toBe("session")
    expect(teamMessageFailure(Object.assign(new Error("Request failed: 500"), { code: "MTM_TEAM_MESSAGE_UNAVAILABLE" }))).toBe("failed")
  })

  it("makes an id the server accepts and initials for the list", () => {
    const id = newTeamMessageId(1760000000000, 0.123456789)
    expect(id.startsWith("team-message-1760000000000-")).toBe(true)
    expect(id.length).toBeGreaterThanOrEqual(8)
    expect(id.length).toBeLessThanOrEqual(128)
    expect(recipientInitials("Elvin Həsənov")).toBe("EH")
    expect(recipientInitials("Rauf İsmayılov")).toBe("Rİ")
    expect(recipientInitials("Nigar")).toBe("NI")
  })

  it("says it in all three languages, the same keys in each", () => {
    const keys = Object.keys(mobileResources.az.teamMessage).sort()
    expect(keys.length).toBeGreaterThan(20)
    for (const locale of ["ru", "en", "az"] as const) {
      const copy = mobileResources[locale].teamMessage as Record<string, string>
      expect(Object.keys(copy).sort()).toEqual(keys)
      for (const key of keys) expect(copy[key]).toBeTruthy()
      expect(copy.wholeTeam).toContain("{{count}}")
      expect(copy.sendOne).toContain("{{name}}")
      expect((mobileResources[locale].managerShell as Record<string, string>).writeTeam).toBeTruthy()
    }
    expect(mobileResources.az.managerShell.writeTeam).toBe("Komandaya yaz")
    expect(mobileResources.az.teamMessage.title).toBe("Komandaya yaz")
    // Every key the screen asks for exists.
    for (const [, key] of screen.matchAll(/t\("teamMessage\.(\w+)"/g)) expect(keys).toContain(key)
  })
})
