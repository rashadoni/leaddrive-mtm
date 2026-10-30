import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const workspace = read("screens/manager/ManagerWorkspaceScreen.android.tsx")
const calendar = read("screens/manager/ManagerPlanningCalendarScreen.android.tsx")
const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
const workday = read("screens/attendance/AttendanceWorkdayScreen.tsx")
const profile = read("screens/profile/ProfileScreen.tsx")
const consent = read("components/AttendanceLocationConsentCard.tsx")
const share = read("screens/manager/ManagerSelfLocationShare.android.tsx")

/**
 * Owner, 2026-10-17, on the manager's phone: «почему у менеджера на главной
 * странице кнопки меню, которые ему не полезны, например поделись местом» and
 * «полностью изучи, может там ещё есть лишние для менеджера меню, ссылки,
 * разделы». He approved a mockup of the home and the list of what goes.
 */
describe("the manager's shell keeps what a manager uses", () => {
  it("Komanda: four live numbers and «create a route» instead of a memo of the tab bar and «share my location»", () => {
    expect(workspace).not.toContain("MobileWorkflowGuide")
    expect(workspace).not.toContain("shareSelfLocation")
    expect(workspace).not.toContain("styles.teamSnapshot")
    expect(workspace).toContain('<TodayTiles')
    for (const key of ["approvals", "visits", "atWork", "attention"]) expect(workspace).toContain(`key: "${key}"`)
    // The approvals tile counts the same queues the Təsdiqlər tab lists.
    expect(workspace).toContain("Promise.all([managerApi.getTeam(), managerApi.getLocations(), approvalQueues(draftWindow).catch(() => null)])")
    expect(workspace).toContain('onPress: () => navigation.navigate("Approvals" as never)')
    expect(workspace).toContain('navigation.navigate("PlanningBuilder", { initialDate: planningTodayKey(new Date(), timezone), initialHorizon: 1 })')
    // «Diqqət»: old or missing GPS, or a visit left open on an earlier day.
    expect(workspace).toContain('truth.gpsFreshness === "STALE" || truth.gpsFreshness === "NO_COORDINATES" || Boolean(agent.openVisitSince)')
    expect(workspace).toContain('t("managerShell.openVisitLeft"')
  })

  it("lays the tiles out in even pairs; a lone last tile takes the row", () => {
    expect(workspace).toContain("const alone = !tablet && tiles.length % 2 === 1 && index === tiles.length - 1")
    expect(workspace).toContain('tileHalf: { flexBasis: "45%", flexGrow: 1 },')
    expect(workspace).toContain('tileWide: { flexBasis: "100%" },')
  })

  it("Planlama and Təsdiqlər: no hint and no memo above the work", () => {
    expect(calendar).not.toContain("copy.guide")
    expect(calendar).not.toContain("styles.guide")
  })

  it("«share my location» lives in Daha çox, unchanged", () => {
    expect(share).toContain('hasCapability(state.capabilities, "SELF_LOCATION_SHARE")')
    expect(share).toContain("managerApi.shareSelfLocation(position)")
    expect(navigator).toContain("const ManagerMoreScreen = () => <ProfileScreen managerShell managerCard={<ManagerSelfLocationShare />} />")
    expect(profile).toContain("{managerShell ? managerCard : (")
    // The profile is shared with agents and office staff: no GPS module of its own.
    expect(profile).not.toContain("ManagerSelfLocationShare")
  })

  it("Daha çox: no back arrow on a tab, no server address, no second location card — for the manager only", () => {
    expect(navigator).toContain("More: ManagerMoreScreen,")
    expect(profile).toContain("{managerShell ? null : (\n              <Pressable\n                accessibilityRole=\"button\"\n                accessibilityLabel={t(\"profile.back\")}")
    const managerBranch = profile.slice(profile.indexOf("{managerShell ? managerCard : ("), profile.indexOf('<SectionCard icon="language-outline"'))
    expect(managerBranch).toContain('t("profile.connectionTitle")')
    expect(managerBranch).toContain("<AttendanceLocationConsentCard />")
  })

  it("İş günü: no tracking line, no location card before the company turns it on, no «Profil» — for the manager only", () => {
    expect(navigator).toContain("const ManagerOwnWorkdayScreen = () => <AttendanceWorkdayScreen managerShell />")
    expect(navigator).toContain("OwnWorkday: ManagerOwnWorkdayScreen,")
    expect(workday).toContain('{managerShell ? null : <Text style={styles.muted}>{t("officeAttendance.noTracking")}</Text>}')
    expect(workday).toContain("<AttendanceLocationConsentCard hideUntilEnabled={managerShell} />")
    expect(workday).toContain('{managerShell ? null : <Pressable accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={() => navigation.navigate("OwnProfile")}>')
    expect(consent).toContain("if (hideUntilEnabled && own?.policy?.enabled !== true && own?.consent?.accepted !== true && !pending) return null")
  })

  it("says the new tiles in all three languages", () => {
    for (const locale of ["ru", "en", "az"] as const) {
      const copy = mobileResources[locale].managerShell as Record<string, string>
      for (const key of ["todayTitle", "tileApprovals", "tileApprovalsHint", "tileVisits", "tileVisitsHint", "tileAtWork", "tileAtWorkHint", "tileAttention", "tileAttentionHint", "openVisitLeft", "createRoute"]) {
        expect(copy[key]).toBeTruthy()
      }
      expect(copy.openVisitLeft).toContain("{{date}}")
    }
  })
})
