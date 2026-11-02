import fs from "fs"
import path from "path"
import {
  ETA_FIX_MAX_AGE_MS,
  freshFix,
  nextStopMinutes,
  nextStopMinutesLabel,
} from "../../src/components/next-stop-eta"
import { mobileResources } from "../../src/i18n/mobile-resources"
import { selectTodayRoute } from "../../src/screens/today/today-state"

/**
 * «6 dəq qaldı» over the agent's marker on the line of the day (owner,
 * 2026-11-02, variant «B. На линии дня»).
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const now = Date.parse("2026-11-02T08:00:00.000Z")
// Two Baku points ~1.5 km apart.
const here = { latitude: 40.3702, longitude: 49.8352 }
const client = { latitude: 40.3796, longitude: 49.8484 }

describe("minutes to the next client", () => {
  it("counts the straight line stretched to the roads at a city's pace", () => {
    // 1.5 km straight → ~2 km of road at 25 km/h ≈ 5 minutes.
    expect(nextStopMinutes(here, client, 100)).toBe(5)
  })

  it("says nothing once the agent is inside the client's zone", () => {
    expect(nextStopMinutes(here, { latitude: 40.3705, longitude: 49.8355 }, 100)).toBeNull()
  })

  it("says nothing without the client's place or with a 0°,0° placeholder", () => {
    expect(nextStopMinutes(here, null, 100)).toBeNull()
    expect(nextStopMinutes(here, { latitude: null, longitude: 49.8 }, 100)).toBeNull()
    expect(nextStopMinutes(here, { latitude: 0, longitude: 0 }, 100)).toBeNull()
  })

  it("says nothing for a trip no next stop of a working day is (wrong data, not a drive)", () => {
    expect(nextStopMinutes(here, { latitude: 41.2, longitude: 47.2 }, 100)).toBeNull()
  })

  it("never says zero minutes", () => {
    expect(nextStopMinutes(here, { latitude: 40.3712, longitude: 49.8352 }, 50)).toBe(1)
  })

  it("plans only by a recent, sharp fix", () => {
    const fix = { ...here, accuracy: 20, timestamp: now - 30_000 }
    expect(freshFix(fix, now)).toEqual(here)
    expect(freshFix({ ...fix, timestamp: now - ETA_FIX_MAX_AGE_MS - 1 }, now)).toBeNull()
    expect(freshFix({ ...fix, accuracy: 900 }, now)).toBeNull()
    expect(freshFix(null, now)).toBeNull()
    expect(nextStopMinutes(freshFix({ ...fix, timestamp: now - 10 * 60_000 }, now), client, 100)).toBeNull()
  })

  it("reads «6 dəq qaldı» and «1 saat 20 dəq qaldı» in every language of the app", () => {
    for (const language of ["az", "ru", "en"] as const) {
      const strings = mobileResources[language].dayTrack as Record<string, string>
      const t = (key: string, values: Record<string, number>) =>
        Object.entries(values).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), strings[key.replace("dayTrack.", "")])
      expect(nextStopMinutesLabel(6, t)).toMatch(/6/)
      expect(nextStopMinutesLabel(80, t)).toMatch(/1\D+20/)
    }
    const az = mobileResources.az.dayTrack as Record<string, string>
    expect(az.minutesLeft).toBe("{{minutes}} dəq qaldı")
  })

  it("keeps the client's place on today's stops", () => {
    const route = selectTodayRoute([{
      id: "r1",
      date: "2026-11-02",
      status: "IN_PROGRESS",
      points: [{ id: "p1", orderIndex: 0, status: "PLANNED", customer: { id: "c1", name: "Aptek", ...client, geofenceRadius: 150 } }],
    }], "2026-11-02")
    expect(route?.nextPoint?.customer).toMatchObject({ ...client, geofenceRadius: 150 })
  })

  it("draws the road to that client in the marker's colour, and only when minutes are shown", () => {
    const track = read("src/components/DayTrack.tsx")
    expect(track).toContain("lead={marker.lead ? marker.color : undefined}")
    const today = read("src/screens/today/TodayScreen.tsx")
    expect(today).toContain("text: nextStopEta != null ? nextStopMinutesLabel(nextStopEta, t) : t(\"dayTrack.here\")")
    expect(today).toContain("lead: nextStopEta != null")
  })
})
