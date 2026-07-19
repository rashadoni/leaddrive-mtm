import { toVisitWorkspace } from "../../src/services/visit-workspace"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("visit workspace mapping", () => {
  it("maps the visit and joins requirements with action results (HIDDEN dropped)", () => {
    const w = toVisitWorkspace({
      id: "v1",
      status: "CHECKED_OUT",
      checkInAt: "2026-07-19T09:00:00.000Z",
      checkOutAt: "2026-07-19T09:25:00.000Z",
      duration: 25,
      outcome: "SUCCESSFUL",
      potential: "HIGH",
      resultNotes: "ok",
      customer: { name: "Clinic", objectType: "CLINIC", phone: "055" },
      contact: { displayName: "Dr A", type: "DOCTOR", specialtyName: "Cardio" },
      requirementSnapshot: {
        requirements: [
          { id: "r1", actionKey: "PHOTO", mode: "REQUIRED" },
          { id: "r2", actionKey: "FEEDBACK", mode: "OPTIONAL" },
          { id: "r3", actionKey: "HIDDEN_ONE", mode: "HIDDEN" },
        ],
      },
      actionResults: [
        { requirementId: "r1", actionKey: "PHOTO", status: "COMPLETED" },
        { requirementId: "r2", actionKey: "FEEDBACK", status: "WAIVED" },
      ],
      tasks: [{ id: "t1", title: "Follow up", status: "PENDING" }],
      photos: [{ id: "p1" }, { id: "p2" }],
    })
    expect(w.id).toBe("v1")
    expect(w.duration).toBe(25)
    expect(w.contact?.name).toBe("Dr A")
    expect(w.requirements).toHaveLength(2)
    expect(w.requirements[0]).toEqual({ actionKey: "PHOTO", mode: "REQUIRED", done: true, waived: false })
    expect(w.requirements[1]).toEqual({ actionKey: "FEEDBACK", mode: "OPTIONAL", done: false, waived: true })
    expect(w.tasks).toEqual([{ id: "t1", title: "Follow up", status: "PENDING" }])
    expect(w.photosCount).toBe(2)
  })

  it("defaults gracefully on a sparse payload", () => {
    const w = toVisitWorkspace({ id: "v2", customer: {} })
    expect(w.requirements).toEqual([])
    expect(w.tasks).toEqual([])
    expect(w.contact).toBeUndefined()
    expect(w.photosCount).toBe(0)
  })

  describe("i18n contract", () => {
    const KEYS = ["sectionTime", "sectionRequirements", "reqRequired", "actionPhoto", "offlineNote"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])("visitWorkspace namespace present in %s", (_lang, locale) => {
      const ns = (locale as { visitWorkspace: Record<string, unknown> }).visitWorkspace
      for (const key of KEYS) {
        expect(typeof ns[key]).toBe("string")
        expect((ns[key] as string).length).toBeGreaterThan(0)
      }
    })
  })
})
