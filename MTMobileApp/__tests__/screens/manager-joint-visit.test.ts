import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const entry = read("screens/manager/ManagerJointVisitEntry.android.tsx")
const jointScreen = read("screens/manager/ManagerJointVisitScreen.android.tsx")
const planScreen = read("screens/manager/ManagerJointVisitPlanScreen.android.tsx")
const evaluation = read("screens/manager/ManagerVisitEvaluationScreen.android.tsx")
const workspace = read("screens/manager/ManagerWorkspaceScreen.android.tsx")
const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
const managerApi = read("services/manager-api.ts")
const coreApi = read("services/api.ts")
const checkIn = read("services/joint-visit-check-in.ts")
const routeScreen = read("screens/route/RouteScreen.tsx")
const visitScreen = read("screens/visit/VisitScreen.tsx")

/**
 * Joint visit (owner, 2026-10-20: «менеджер может идти с агентом вместе к
 * клиенту… во время визита менеджер мог оценивать работу агента»; mockup
 * approved with «Давай, агент оценку не видит»).
 */
describe("joint visit in the app", () => {
  it("puts «Иду на визит с агентом» on «Команда» under the pair, for a manager with routes", () => {
    const afterPair = workspace.slice(workspace.indexOf("<View style={styles.homeActions}>"), workspace.indexOf("{loadError && ("))
    expect(afterPair).toContain('{shellTabs.includes("Planning") ? <ManagerJointVisitEntry agents={teamRows.map(({ agent }) => agent)} /> : null}')
    expect(entry).toContain('testID="manager-joint-visit-start"')
    expect(entry).toContain('t("jointVisit.startButton")')
    // Only field agents can be accompanied: they are the ones who check in.
    expect(entry).toContain('agents.filter((agent) => agent.role === "AGENT")')
  })

  it("registers both screens in the manager's stack only", () => {
    const managerBlock = navigator.slice(navigator.indexOf("{managerShell ? ("), navigator.indexOf(") : hasServer ? ("))
    expect(managerBlock).toContain('<Stack.Screen name="ManagerJointVisit" component={withFieldColorScheme(ManagerJointVisitScreen)} />')
    expect(managerBlock).toContain('<Stack.Screen name="ManagerVisitEvaluation" component={withFieldColorScheme(ManagerVisitEvaluationScreen)} />')
    expect(managerBlock).toContain('<Stack.Screen name="ManagerJointVisitPlan" component={withFieldColorScheme(ManagerJointVisitPlanScreen)} />')
    expect(navigator.match(/name="ManagerJointVisit"/g)).toHaveLength(1)
    expect(navigator.match(/name="ManagerJointVisitPlan"/g)).toHaveLength(1)
    expect(navigator.match(/name="ManagerVisitEvaluation"/g)).toHaveLength(1)
  })

  it("talks to the server's joint-visit endpoints through the manager facade", () => {
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/joint-visit", { signal })')
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/joint-visit", { method: "POST", body: JSON.stringify({ agentId }) })')
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/joint-visit/end", { method: "POST", body: "{}" })')
    expect(managerApi).toContain("/mobile/manager/visits/${encodeURIComponent(visitId)}/evaluation")
    expect(coreApi).toContain('return this.request("/mobile/joint-visit", { signal }, 6_000)')
    // Planned ahead (2026-10-30): the agent's day, save, take back, and the agent's clients for an extra stop.
    expect(managerApi).toContain("`/mobile/manager/joint-visit/plans?${query.toString()}`")
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/joint-visit/plans", { method: "POST", body: JSON.stringify(data) })')
    expect(managerApi).toContain("`/mobile/manager/joint-visit/plans/${encodeURIComponent(id)}`, { method: \"DELETE\" }")
    expect(managerApi).toContain("`/mobile/routes/targets?${query.toString()}`")
  })

  it("asks the agent at both check-ins and sends the answer with the visit", () => {
    // The route names the stop, so a manager who planned it is asked about by name.
    expect(routeScreen).toContain("const joint = await askJointManagerForCheckIn(t, { routePointId: point.id, customerId: point.customer.id })")
    expect(visitScreen).toContain("const joint = await askJointManagerForCheckIn(t, { customerId: customer.id })")
    for (const screen of [routeScreen, visitScreen]) expect(screen).toContain("jointManagerId: joint.jointManagerId,")
    // Closing the sheet starts no visit: the agent must choose.
    expect(checkIn).toContain("if (answer === JOINT_ANSWER_DISMISSED) return { proceed: false }")
    expect(checkIn).toContain("dismissValue: JOINT_ANSWER_DISMISSED")
  })

  it("has every text in Russian, English and Azerbaijani, and every key the screens ask for", () => {
    const keysOf = (value: Record<string, unknown>, prefix = ""): string[] => Object.entries(value).flatMap(([key, inner]) => (
      inner && typeof inner === "object" ? keysOf(inner as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]
    ))
    const base = (key: string) => key.replace(/_(one|few|many|other)$/, "")
    const shared = (locale: "ru" | "en" | "az") => [...new Set(keysOf(mobileResources[locale].jointVisit).map(base))].sort()
    expect(shared("ru").length).toBeGreaterThan(60)
    expect(shared("en")).toEqual(shared("ru"))
    expect(shared("az")).toEqual(shared("ru"))
    for (const locale of ["ru", "en", "az"] as const) {
      for (const key of keysOf(mobileResources[locale].jointVisit)) {
        expect(`${locale}.${key}: ${Boolean(key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], mobileResources[locale].jointVisit))}`).toBe(`${locale}.${key}: true`)
      }
      expect(Object.keys(mobileResources[locale].jointVisit.criteria)).toEqual(["PREPARATION", "RAPPORT", "NEEDS", "PRESENTATION", "OBJECTIONS", "CLOSING"])
    }
    const used = [entry, jointScreen, planScreen, evaluation, checkIn, routeScreen, read("services/joint-visit.ts")]
      .flatMap((source) => [...source.matchAll(/t\("jointVisit\.([\w.]+)"/g)].map((match) => match[1]))
    expect(used.length).toBeGreaterThan(30)
    for (const key of used) expect(shared("ru")).toContain(key)
    expect(mobileResources.az.jointVisit.startButton).toBe("Birgə vizit planla")
    expect(Object.keys(mobileResources.ru.jointVisit.plan.errors).sort()).toEqual(
      ["alreadyVisited", "clientNotHis", "dayInvalid", "failed", "notInTeam", "offline", "routeChanged", "routeClosed", "session", "stopGone"],
    )
    expect(mobileResources.ru.jointVisit.askTitle).toBe("Этот визит — вместе с руководителем?")
  })

  it("never tells the agent his rating: the agent's side reads managers only", () => {
    const service = read("services/joint-visit.ts")
    const agentSide = service.slice(service.indexOf("// ── The agent's side"))
    expect(agentSide).not.toMatch(/scores|evaluation/i)
    expect(checkIn).not.toMatch(/scores|evaluation/i)
  })

  it("takes every colour from the palette, in both themes, so the night theme reaches the new screens", () => {
    const found: string[] = []
    for (const [file, source] of [["entry", entry], ["joint", jointScreen], ["plan", planScreen], ["evaluation", evaluation]] as const) {
      source.split("\n").forEach((line, index) => {
        if (/(?:olor|Color)\s*:\s*"(?:#|rgb)/.test(line)) found.push(`${file}:${index + 1}`)
      })
    }
    expect(found).toEqual([])
    for (const source of [entry, jointScreen, planScreen, evaluation]) expect(source).toContain("const styles = themed(() => StyleSheet.create({")
    for (const source of [jointScreen, planScreen, evaluation]) {
      expect(source).toContain('import LightScreenStatusBar from "../../components/LightScreenStatusBar"')
      expect(source).toContain("<LightScreenStatusBar />")
    }
  })

  it("keeps «Сохранить оценку» above the keyboard", () => {
    expect(evaluation).toContain('<KeyboardAvoidingView style={styles.root} behavior="padding">')
  })

  // The owner's bug, 2026-10-30: the manager pressed «Иду на визит с агентом»
  // and saw only «Закончить»; the agent saw nothing on his route.
  it("plans where the manager goes, and shows it on the agent's route", () => {
    // «Команда» opens the planner; no session is started from the new app.
    expect(entry).toContain('navigation.navigate(\n    "ManagerJointVisitPlan",')
    expect(entry).not.toContain("startJointVisit")
    expect(planScreen).toContain("await managerApi.saveJointPlans(planBody({ agentId, date, stopIds: [...ticked], extras }))")
    expect(planScreen).toContain('testID="joint-plan-add-extra"')
    // Saved: back to the list, never a second list on top of the planner.
    expect(planScreen).toContain('navigation.popTo("ManagerJointVisit")')
    expect(planScreen).not.toContain('navigation.navigate("ManagerJointVisit")')
    expect(jointScreen).toContain('testID="manager-joint-visit-plan"')
    expect(jointScreen).toContain("await managerApi.cancelJointPlan(row.id)")
    expect(routeScreen).toContain('jointWith={jointByStop.get(item.id)?.join(", ") ?? null}')
    expect(routeScreen).toContain('i18next.t("jointVisit.routeMark", { name: jointWith })')
    // A route still waiting for approval lists its stops apart; the mark is there too.
    expect(routeScreen).toContain('testID={`route-awaiting-joint-mark-${stop.key}`}')
  })
})

