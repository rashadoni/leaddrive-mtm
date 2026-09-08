import {
  isVisibleSyncPipeline,
  visibleSyncPipelines,
  syncCentreLastSyncText,
} from "../../src/lib/sync-centre-pipelines"
import { formatLocalizedDate } from "../../src/lib/format-localized-date"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

const ORDER = [
  { id: "routeCommands" }, { id: "routeOutbox" }, { id: "routePull" },
  { id: "routeV2Pull" }, { id: "media" },
]

const idle = { phase: "idle", lastSucceededAt: null }

function lanes(overrides: Record<string, { phase: string; lastSucceededAt?: number | null }> = {}) {
  return {
    routeCommands: { ...idle }, routeOutbox: { ...idle }, routePull: { ...idle },
    routeV2Pull: { ...idle }, media: { ...idle }, ...overrides,
  }
}

describe("sync centre lane list (field UX audit B12)", () => {
  it("hides the pilot lane the engine never armed for this tenant", () => {
    // Not in the v2 cohort: the engine takes the withdrawal branch and leaves
    // this lane at idle, so the sheet used to report it READY forever.
    expect(visibleSyncPipelines(ORDER, lanes()).map((p) => p.id))
      .toEqual(["routeCommands", "routeOutbox", "routePull", "media"])
  })

  it("shows the pilot lane once it has actually run", () => {
    const withRun = lanes({ routeV2Pull: { phase: "idle", lastSucceededAt: 1_757_000_000_000 } })
    expect(visibleSyncPipelines(ORDER, withRun).map((p) => p.id)).toContain("routeV2Pull")
  })

  it("shows the pilot lane while it is working, before any success", () => {
    for (const phase of ["syncing", "backoff", "error"]) {
      expect(isVisibleSyncPipeline("routeV2Pull", { phase, lastSucceededAt: null })).toBe(true)
    }
  })

  it("hides a lane the server switched off", () => {
    const off = lanes({ media: { phase: "disabled" }, routePull: { phase: "disabled" } })
    expect(visibleSyncPipelines(ORDER, off).map((p) => p.id)).toEqual(["routeCommands", "routeOutbox"])
  })

  it("keeps every lane that is doing something", () => {
    const busy = lanes({
      routeCommands: { phase: "syncing" }, routeOutbox: { phase: "backoff" }, routePull: { phase: "error" },
    })
    expect(visibleSyncPipelines(ORDER, busy).map((p) => p.id))
      .toEqual(["routeCommands", "routeOutbox", "routePull", "media"])
  })

  it("hides a lane whose status is missing rather than rendering a blank row", () => {
    expect(isVisibleSyncPipeline("media", undefined)).toBe(false)
  })
})

describe("sync centre last-sync stamp (field UX audit B12)", () => {
  const moment = new Date(2026, 8, 5, 14, 30, 7)

  it("drops the seconds and keeps the clock to the minute", () => {
    const out = syncCentreLastSyncText(moment, "ru", formatLocalizedDate)
    expect(out).toContain("14:30")
    expect(out).not.toContain(":07")
  })

  it("writes the month in Azerbaijani rather than an ICU root fallback", () => {
    const out = syncCentreLastSyncText(moment, "az", formatLocalizedDate)
    expect(out).toBe("5 sen, 14:30")
  })

  it("says nothing at all for an unusable timestamp", () => {
    expect(syncCentreLastSyncText("not a date", "en", formatLocalizedDate)).toBe("")
  })
})

describe("sync centre heading", () => {
  it.each([["en", en], ["ru", ru], ["az", az]])("names the section in %s the way a rep would", (_lang, locale) => {
    const value = (locale as { syncCenter: { pipelines: string } }).syncCenter.pipelines
    expect(typeof value).toBe("string")
    expect(value.length).toBeGreaterThan(0)
    // "Контуры синхронизации" is engineering vocabulary; the heading answers
    // the rep's actual question instead.
    expect(value.toLowerCase()).not.toMatch(/контур|kontur|pipeline/)
  })
})
