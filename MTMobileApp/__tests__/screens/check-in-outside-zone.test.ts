import fs from "fs"
import path from "path"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const route = read("src/screens/route/RouteScreen.tsx")
const visit = read("src/screens/visit/VisitScreen.tsx")

/**
 * Owner, 7 October 2026: «нужна возможность отключения из настроек — если
 * агент не на месте, но мог делать чек-ин, и потом проверить». The web matrix
 * got a switch; the server accepts such a check-in and records the distance.
 * The app used to stop the agent itself, before the server was ever asked — so
 * the switch would have changed nothing on a phone.
 */
describe("check-in while not at the client, when the organization allows it", () => {
  it("asks the agent on the route screen instead of sending him away", () => {
    const gate = route.slice(route.indexOf("const canOverride = api.canForceCheckIn"), route.indexOf("forceCheckIn = canOverride"))
    expect(gate).toContain("const outsideAllowed = !canOverride && agentMayCheckInOutsideZone(useBootstrapStore.getState().data?.policies)")
    expect(gate).toContain("} else if (outsideAllowed) {")
    expect(gate).toContain('message: t("visit.outsideZoneAllowedBody", { distance: formatDistance(measuredDistance), name: point.customer.name, max: pointCheckInRadius(point) })')
    expect(gate).toContain('{ text: t("visit.checkInAnyway"), value: true }')
    // «Cancel», back and a tap outside still end the check-in.
    expect(gate).toContain("if (!proceed) {")
  })

  it("asks him on the unplanned-visit screen too", () => {
    const gate = visit.slice(visit.indexOf("if (distance > radius) {"), visit.indexOf("forceCheckIn = api.canForceCheckIn"))
    expect(gate).toContain("const outsideAllowed = !api.canForceCheckIn && agentMayCheckInOutsideZone(useBootstrapStore.getState().data?.policies)")
    expect(gate).toContain("if (!api.canForceCheckIn && !outsideAllowed) {")
    expect(gate).toContain('message: t(outsideAllowed ? "visit.outsideZoneAllowedBody" : "visit.tooFarBody", {')
  })

  it("does not send `force` for it: that is a supervisor's override, and the server refuses it to an agent", () => {
    expect(route).toContain("forceCheckIn = canOverride")
    expect(visit).toContain("forceCheckIn = api.canForceCheckIn")
    expect(route).not.toContain("forceCheckIn = true")
    expect(visit).not.toContain("forceCheckIn = true")
  })

  it("still refuses when the organization has not allowed it", () => {
    const refused = route.slice(route.indexOf("} else if (outsideAllowed) {"), route.indexOf("forceCheckIn = canOverride"))
    expect(refused).toContain('message: t("route.tooFarSupervisorBody"')
    expect(visit).toContain('message: t("visit.tooFarAskSupervisor", {')
  })

  it("tells the agent what happens to the visit, in all three languages", () => {
    for (const [locale, strings] of [["az", az], ["en", en], ["ru", ru]] as const) {
      const text = (strings as { visit: Record<string, string> }).visit.outsideZoneAllowedBody
      expect([locale, typeof text]).toEqual([locale, "string"])
      for (const placeholder of ["{{distance}}", "{{name}}", "{{max}}"]) {
        expect([locale, placeholder, text.includes(placeholder)]).toEqual([locale, placeholder, true])
      }
    }
    expect(ru.visit.outsideZoneAllowedBody).toContain("вне зоны")
    expect(ru.visit.outsideZoneAllowedBody).toContain("руководитель")
  })
})
