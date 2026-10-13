import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Owner, 2026-10-13, on the phone: «İş günü bitib — 10:56-da bitib. Yeni iş
 * gününə sabah başlamaq olar», a grey button «Gün bitib», and the question
 * «как теперь обратно включить день?». The card of a day finished today now
 * carries a working button with words on it.
 *
 * The behaviour behind the button is in `__tests__/workday/workday-return.test.ts`;
 * this file keeps the screen wired to it.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const today = read("screens/today/TodayScreen.tsx")
const apiClient = read("services/api.ts")

describe("Today: a day finished today can be returned to", () => {
  it("offers the return only where the server said it can, and not after its refusal", () => {
    expect(today).toContain("useBootstrapStore((state) => canReturnToWorkday(state.data?.policies))")
    expect(today).toContain("const workdayReturnable = workdayFinishedToday && serverReturnsWorkdays && !workdayReturnRefused")
    expect(today).toContain("const workdayClosedForGood = workdayFinishedToday && !workdayReturnable")
  })

  it("keeps the button dead only for a day that cannot be returned to", () => {
    const button = today.slice(today.indexOf("onPress={requestWorkdayAction}") - 500, today.indexOf("onPress={requestWorkdayAction}") + 500)
    expect(button).toContain("disabled={workdayBusy || !workdayHydrated || workdayStarting || workdayEnding || workdayClosedForGood}")
    // The old condition greyed the button for every finished day.
    expect(today).not.toContain("workdayEnding || workdayFinishedToday}")
    expect(today).not.toContain("workdayEnding || workdayFinishedToday)")
  })

  it("returns instead of starting: the tap never queues a second START", () => {
    const handler = today.slice(today.indexOf("const requestWorkdayAction = useCallback"), today.indexOf("setEndDayConfirm(true)"))
    expect(handler.indexOf("if (workdayReturnable)")).toBeGreaterThan(-1)
    expect(handler.indexOf("if (workdayReturnable)")).toBeLessThan(handler.indexOf("if (!workdayOpen)"))
    expect(handler).toContain("returnToWorkday().catch(() => {})")
  })

  it("refreshes the session after the return, so the route and GPS see the day running", () => {
    const handler = today.slice(today.indexOf("const returnToWorkday = useCallback"), today.indexOf("const requestWorkdayAction = useCallback"))
    expect(handler).toContain("await returnToClosedWorkday(currentWorkdayKey, workdayId)")
    expect(handler.indexOf("await refreshRouteFieldSession()")).toBeGreaterThan(handler.indexOf("await returnToClosedWorkday("))
    expect(handler).toContain('if (outcome === "notToday" || outcome === "locked") setReturnRefusal({ workdayId, reason: outcome })')
    expect(handler).toContain("setWorkdayError(true)")
  })

  it("says what the button does and why it was refused", () => {
    expect(today).toContain('? "todayV2.returnToWork"')
    expect(today).toContain('t(workdayReturnable ? "todayV2.dayFinishedReturn" : "todayV2.dayFinishedAt", { time: finishedAt ?? "" })')
    expect(today).toContain('t(workdayReturnRefused === "locked" ? "todayV2.returnLocked" : "todayV2.returnNotToday")')
  })

  it("has every sentence in all three languages, the time where it is promised", () => {
    const missing: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const texts = mobileResources[locale].todayV2 as Record<string, string>
      for (const key of ["returnToWork", "dayFinishedReturn", "returnNotToday", "returnLocked"]) {
        if (typeof texts[key] !== "string" || texts[key].trim().length === 0) missing.push(`${locale}.${key}`)
      }
      if (!texts.dayFinishedReturn?.includes("{{time}}")) missing.push(`${locale}.dayFinishedReturn {{time}}`)
      // The sentence of a returnable day must not also say "tomorrow".
      if (texts.dayFinishedReturn === texts.dayFinishedAt) missing.push(`${locale}.dayFinishedReturn repeats dayFinishedAt`)
    }
    expect(missing).toEqual([])
  })

  it("keeps the button's words short enough for the phone row", () => {
    for (const locale of ["ru", "en", "az"] as const) {
      const texts = mobileResources[locale].todayV2 as Record<string, string>
      // «Завершить день» is the longest caption this row already carries.
      expect(texts.returnToWork.length).toBeLessThanOrEqual(20)
    }
  })
})

describe("the request goes to the server's own door", () => {
  it("posts to the v2 route-field path, online, with the day and the tap's id", () => {
    const method = apiClient.slice(apiClient.indexOf("async returnToWorkday("), apiClient.indexOf("async cancelOrganizationLocationRequest("))
    expect(method).toContain("data: { operationId: string; workdayId: string }")
    expect(method).toContain('this.request("/mobile/route-field/workday-return", {')
    expect(method).toContain('method: "POST"')
    expect(method).toContain("}, 20_000, 2, guard)")
  })
})
