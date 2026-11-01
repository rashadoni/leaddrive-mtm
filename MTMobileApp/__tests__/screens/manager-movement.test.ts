/**
 * Car, on foot or standing, and which way, on the manager's maps (owner,
 * 2026-11-01, of the mockup «MTM: движение на карте», step 3): the server
 * reads it, the app draws it — a badge and an arrow on the live map, the
 * day's line by the way he moved, and the day played by the clock without
 * anything drawn across a break. Fictional places.
 */
import fs from "fs"
import path from "path"
import { buildEmployeeDayDocument } from "../../src/screens/manager/employee-day-map"
import { buildManagerLiveMapDocument, buildManagerLiveMapModel } from "../../src/screens/manager/manager-live-map"
import { managerAgentTruth, normalizeManagerLocations } from "../../src/services/manager-location-truth"
import { toEmployeeDay } from "../../src/services/manager-employee-day"
import { compassPoint } from "../../src/screens/maps/movement-icons"

const NOW = Date.parse("2026-11-01T10:00:00.000Z")
const agent = (id: string) => ({ id, name: `Agent ${id}`, role: "AGENT", isOnline: true, lastSeenAt: new Date(NOW).toISOString(), workday: { status: "STARTED" } })
const serverRow = (id: string, movement: unknown, minutesAgo = 0.5) => ({
  id,
  isOnline: true,
  lastSeenAt: new Date(NOW).toISOString(),
  movement,
  location: { latitude: 40.41, longitude: 49.86, recordedAt: new Date(NOW - minutesAgo * 60_000).toISOString() },
})

describe("the live map says how each employee is moving", () => {
  it("reads the server's movement, and nothing it does not know", () => {
    const rows = normalizeManagerLocations([
      serverRow("car", { mode: "DRIVE", course: 0 }),
      serverRow("still", { mode: "STAY", course: 120 }),
      serverRow("odd", { mode: "FLY", course: 10 }),
      serverRow("older-server", undefined),
    ])
    expect(rows.map((row) => row.movement)).toEqual([
      // Due north is a course, not «none».
      { mode: "DRIVE", course: 0 },
      { mode: "STAY", course: null },
      null,
      null,
    ])
  })

  it("puts it only on a current marker, with a badge and an arrow drawn from fixed pictures", () => {
    const locations = normalizeManagerLocations([serverRow("car", { mode: "DRIVE", course: 90 }), serverRow("old", { mode: "WALK", course: 10 }, 30)])
    const model = buildManagerLiveMapModel(["car", "old"].map((id) => ({ agent: agent(id), truth: managerAgentTruth(agent(id), locations, NOW) })))
    expect(model.markers.map((marker) => [marker.id, marker.status, marker.movement])).toEqual([
      ["car", "CURRENT", { mode: "DRIVE", course: 90 }],
      ["old", "STALE", null],
    ])
    const html = buildManagerLiveMapDocument(model.markers.map((marker) => ({ ...marker, statusLabel: "online", ageLabel: "now", movementLabel: "by car · east" })), {
      languageCode: "en", accessibilityLabel: "Map", tapHint: "Tap", zoomIn: "+", zoomOut: "-", fit: "Fit", mapLoading: "…", mapUnavailable: "No map", mapAttribution: "© OSM",
    })
    expect(html).toContain('"mode":"DRIVE","course":90')
    expect(html).toContain('badge.className = "marker-mode"')
    expect(html).toContain('arrow.setAttribute("class", "marker-arrow")')
    expect(html).toContain("connect-src 'none'")
  })

  it("names the eight points of the compass", () => {
    expect([0, 44, 90, 135, 180, 225, 270, 315, 359].map(compassPoint)).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"])
  })
})

describe("the employee's day can be played", () => {
  const at = (minutes: number) => new Date(Date.parse("2026-11-01T05:00:00.000Z") + minutes * 60_000).toISOString()
  const point = (minutes: number, east: number, mode: string, course: number | null) =>
    ({ recordedAt: at(minutes), latitude: 40.4, longitude: 49.85 + east / 85_000, mode, course })
  const data = {
    range: { date: "2026-11-01", timezone: "Asia/Baku" },
    points: [point(0, 0, "DRIVE", 90), point(0.5, 300, "DRIVE", 90), point(1, 600, "STAY", null), point(40, 700, "WALK", 45), point(40.5, 740, "WALK", 45)],
    // A break from the third fix to the fourth.
    gaps: [{ startedAt: at(1), endedAt: at(40), reason: "WORKDAY_PAUSED" }],
  }

  it("keeps each fix with its time, mode and course, and what lies after it", () => {
    const day = toEmployeeDay(data, true)
    expect(day.fixes.map((fix) => [fix.mode, fix.course, fix.cut])).toEqual([
      ["DRIVE", 90, null],
      ["DRIVE", 90, null],
      ["STAY", null, "BREAK"],
      ["WALK", 45, null],
      ["WALK", 45, null],
    ])
    // The track is broken at the break, and each place knows its fix.
    expect(day.track.map((segment) => segment.map((place) => place.fix))).toEqual([[0, 1, 2], [3, 4]])
  })

  it("gives every place of the street line a fix, never going back", () => {
    const day = toEmployeeDay({ ...data, matchedTrack: { segments: [[[40.4, 49.85], [40.4, 49.8535], [40.4, 49.857], [40.4, 49.8585], [40.4, 49.8587]]] } }, true)
    const fixes = day.track[0].map((place) => place.fix!)
    expect(fixes[0]).toBe(0)
    expect([...fixes].sort((a, b) => a - b)).toEqual(fixes)
    expect(day.track[0][0].mode).toBe("DRIVE")
  })

  it("draws the replay bar only with its words and at least two fixes", () => {
    const day = toEmployeeDay(data, false)
    const base = { language: "ru", accessibilityLabel: "Карта", current: "сейчас", mapLoading: "…", mapUnavailable: "нет", mapAttribution: "© OSM" }
    const replay = { play: "Проиграть день", pause: "Пауза", skipStill: "Пропускать стоянки", time: "Время", modes: { DRIVE: "на машине" }, compass: { E: "на восток" } }
    const withBar = buildEmployeeDayDocument(day, { ...base, replay })
    expect(withBar).toContain('<button id="play" type="button">▶ Проиграть день</button>')
    expect(withBar).toContain('<input id="skip" type="checkbox" checked />Пропускать стоянки')
    expect(withBar).toContain('"cut":"BREAK"')
    expect(buildEmployeeDayDocument(day, base)).not.toContain('id="play"')
  })
})

describe("the phone sends standing still and due north", () => {
  it("no longer drops a speed of 0 or a course of 0°", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/services/location.android.ts"), "utf8")
    expect(source).not.toContain("heading: heading || undefined")
    expect(source).not.toContain("speed: speed ? speed * 3.6 : undefined")
    expect(source).toContain("heading: typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading <= 360 ? heading : undefined")
  })
})
