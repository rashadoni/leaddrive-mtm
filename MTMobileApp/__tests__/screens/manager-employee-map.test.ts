/**
 * The map on the manager's card of one employee: the track, the day's points by
 * number in the colour of what became of them, «now». Fictional places.
 */
import fs from "fs"
import path from "path"
import { buildEmployeeDayDocument, employeeDayHasMap } from "../../src/screens/manager/employee-day-map"
import { toEmployeeDay } from "../../src/services/manager-employee-day"

const LABELS = { language: "ru", accessibilityLabel: "Карта дня", current: "сейчас", mapLoading: "…", mapUnavailable: "нет карты", mapAttribution: "© OSM" }
const DAY = toEmployeeDay({
  range: { date: "2026-10-17", timezone: "Asia/Baku" },
  points: [
    { recordedAt: "2026-10-17T05:00:00.000Z", latitude: 40.40, longitude: 49.85 },
    { recordedAt: "2026-10-17T06:00:00.000Z", latitude: 40.41, longitude: 49.86 },
  ],
  plannedRoutes: [{ status: "IN_PROGRESS", points: [
    { id: "a", status: "VISITED", label: "Fictional </script><b>Clinic", customer: { latitude: 40.405, longitude: 49.855 } },
    { id: "b", status: "PENDING", label: "Fictional Hospital", customer: { latitude: 40.42, longitude: 49.87 } },
  ] }],
}, true)

describe("the employee's day map", () => {
  it("carries the track, the numbered points with their state, and where he is now", () => {
    const html = buildEmployeeDayDocument(DAY, LABELS)
    expect(html).toContain('"order":1')
    expect(html).toContain('"order":2')
    expect(html).toContain('"ahead":true')
    expect(html).toContain('"fill":"#08705a"')
    expect(html).toContain('var current = {"latitude":40.41,"longitude":49.86}')
    expect(html).toContain("connect-src 'none'")
    // Point names never reach the page; nothing can close its script.
    expect(html).not.toContain("Clinic")
    expect(html).not.toMatch(/<\/script><b>/)
  })

  it("draws nothing for a day with no points and no route", () => {
    expect(employeeDayHasMap(DAY)).toBe(true)
    expect(employeeDayHasMap(toEmployeeDay({}, false))).toBe(false)
  })
})

describe("«Komanda» opens the employee", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
  const workspace = read("screens/manager/ManagerWorkspaceScreen.android.tsx")
  const navigator = read("navigation/AppNavigatorAndroidV2.tsx")

  it("makes every team card a button to his card, with today's visits on it", () => {
    const card = workspace.slice(workspace.indexOf("function AgentTruthCard"))
    expect(card).toContain("<Pressable\n      testID={`manager-agent-card-${agent.id}`}")
    expect(card).toContain("onPress={onOpen}")
    expect(card).toContain('t("managerShell.visitsToday", { visited: route.visited, planned: route.planned })')
    expect(workspace).toContain('navigation.navigate("ManagerEmployee", { agentId: agent.id, name: agent.name, isOnline: truth.isOnline })')
  })

  it("registers the card in the manager's navigator only", () => {
    const managerBlock = navigator.slice(navigator.indexOf("{managerShell ? ("), navigator.indexOf("{managerShell ? (") + 900)
    expect(managerBlock).toContain('<Stack.Screen name="ManagerEmployee" component={ManagerEmployeeScreen} />')
    expect(navigator.match(/name="ManagerEmployee"/g)).toHaveLength(1)
  })
})
