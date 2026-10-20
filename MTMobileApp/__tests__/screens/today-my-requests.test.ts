import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"
import { requestsWaitingCount } from "../../src/screens/today/requests-waiting"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const today = read("screens/today/TodayScreen.tsx")
const more = read("screens/more/MoreScreen.tsx")
const navigator = read("navigation/AppNavigatorAndroidV2.tsx")

/**
 * «Müraciətlərim» belongs to time-keeping, not to «Daha çox» (owner,
 * 2026-10-20: «это нужно, чтоб отображалось в модуле учётов, а не здесь»;
 * mockup approved with «Давай»): a row under the workday card on «Bu gün».
 */
describe("«Müraciətlərim» under the workday card", () => {
  it("counts the requests that still wait for the manager, sent or not yet sent", () => {
    expect(requestsWaitingCount(
      [{ status: "PENDING" }, { status: "APPROVED" }, { status: "PENDING" }, { status: "REJECTED" }, { status: "CANCELLED" }],
      [{ op: "create" }, { op: "cancel" }],
    )).toBe(3)
    expect(requestsWaitingCount([], [])).toBe(0)
  })

  it("stands right under the workday card, for the agents allowed to send requests", () => {
    const row = today.indexOf('testID="today-my-requests"')
    expect(row).toBeGreaterThan(today.indexOf("<View style={styles.workdayPanel}>"))
    expect(row).toBeLessThan(today.indexOf("{qr.available && !staleDay && !workdayPaused"))
    expect(today.slice(row - 200, row)).toContain("{finishTimeRequestable ? (")
    expect(today).toContain('onPress={() => navigation.navigate("AttendanceRequests")}')
    expect(today).toContain("setRequestsWaiting(requestsWaitingCount(requests, queued))")
  })

  it("opens over the tabs, so «Geri» comes back to «Bu gün»", () => {
    expect(navigator).toContain('{agentMayAttendanceRequests(bootstrap?.policies) ? <Stack.Screen name="AttendanceRequests" component={withFieldColorScheme(AttendanceRequestsScreen)} /> : null}')
  })

  it("is no longer an item of «Daha çox»", () => {
    expect(more).not.toContain("AttendanceRequests")
    expect(more).not.toContain("attendanceRequests.title")
  })

  it("says how many wait in every language", () => {
    expect(mobileResources.ru.todayV2.requestsWaiting_few).toBe("{{count}} заявки ждут ответа руководителя")
    expect(mobileResources.az.todayV2.requestsWaiting_other).toBe("{{count}} müraciət rəhbərin cavabını gözləyir")
    expect(mobileResources.en.todayV2.requestsWaiting_one).toBe("{{count}} request awaits your manager")
  })
})
