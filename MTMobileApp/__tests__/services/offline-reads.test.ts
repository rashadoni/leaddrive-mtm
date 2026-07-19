import AsyncStorage from "@react-native-async-storage/async-storage"
import { applySyncChanges } from "../../src/services/sync-cache"
import {
  mapCachedContact,
  mapCachedOrganization,
  mapCachedRoute,
  mapCachedTask,
  matchesContactSearch,
  matchesOrganizationSearch,
  readOfflineContacts,
  readOfflineOrganizations,
  readOfflineRoute,
  readOfflineTasks,
  selectActiveRoute,
} from "../../src/services/offline-reads"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import { mobileResources } from "../../src/i18n/mobile-resources"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

describe("offline task reads (durable sync cache)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  describe("mapCachedTask", () => {
    it("maps sync-pull task fields onto the screen shape", () => {
      const task = mapCachedTask({
        id: "t1",
        title: "Call Dr. Aliyev",
        description: "Follow up on samples",
        status: "PENDING",
        priority: "HIGH",
        dueDate: "2026-07-20T00:00:00.000Z",
        customerId: "c1",
        completedAt: null,
        updatedAt: "2026-07-19T09:00:00.000Z",
      })
      expect(task).toEqual({
        id: "t1",
        title: "Call Dr. Aliyev",
        description: "Follow up on samples",
        status: "PENDING",
        priority: "HIGH",
        dueDate: "2026-07-20T00:00:00.000Z",
        customer: undefined,
      })
    })

    it("hydrates the customer name/address from the cached customers map", () => {
      const customers = new Map([["c1", { id: "c1", name: "Aptek #7", address: "Baku, Nizami 12" }]])
      const task = mapCachedTask({ id: "t2", title: "Deliver", status: "PENDING", priority: "LOW", customerId: "c1" }, customers)
      expect(task.customer).toEqual({ name: "Aptek #7", address: "Baku, Nizami 12" })
    })

    it("defaults a missing priority to MEDIUM and omits empty optional fields", () => {
      const task = mapCachedTask({ id: "t3", title: "Untitled", status: "PENDING" })
      expect(task.priority).toBe("MEDIUM")
      expect(task.description).toBeUndefined()
      expect(task.dueDate).toBeUndefined()
      expect(task.customer).toBeUndefined()
    })
  })

  describe("readOfflineTasks", () => {
    it("returns the last-synced tasks joined with cached customers for the scope", async () => {
      await applySyncChanges(
        "tenant-a",
        "agent-a",
        {
          customers: { updated: [{ id: "c1", name: "Clinic One" }] },
          tasks: {
            updated: [
              { id: "t1", title: "Visit clinic", status: "PENDING", priority: "MEDIUM", customerId: "c1" },
              { id: "t2", title: "Report", status: "COMPLETED", priority: "LOW" },
            ],
          },
        },
        "v1",
      )
      const tasks = await readOfflineTasks("tenant-a", "agent-a")
      expect(tasks.map((t) => t.id)).toEqual(["t1", "t2"])
      expect(tasks[0].customer).toEqual({ name: "Clinic One", address: undefined })
      expect(tasks[1].customer).toBeUndefined()
    })

    it("returns [] when nothing has been synced for the scope", async () => {
      await applySyncChanges("tenant-a", "agent-a", { tasks: { updated: [{ id: "t1", title: "X", status: "PENDING" }] } }, "v1")
      expect(await readOfflineTasks("tenant-b", "agent-a")).toEqual([])
      expect(await readOfflineTasks(null, null)).toEqual([])
    })
  })

  describe("mapCachedRoute", () => {
    it("maps the sync-pull route + points and derives point totals", () => {
      const route = mapCachedRoute({
        id: "r1",
        name: "North loop",
        date: "2026-07-20T00:00:00.000Z",
        status: "PLANNED",
        points: [
          { id: "p1", orderIndex: 0, status: "VISITED", plannedTime: "2026-07-20T09:00:00.000Z", customer: { id: "c1", name: "Clinic", address: "Baku" } },
          { id: "p2", orderIndex: 1, status: "PENDING", customer: { id: "c2", name: "Aptek" } },
        ],
      })
      expect(route.id).toBe("r1")
      expect(route.name).toBe("North loop")
      expect(route.totalPoints).toBe(2)
      expect(route.visitedPoints).toBe(1)
      expect(route.points[0].customer).toEqual({ id: "c1", name: "Clinic", address: "Baku" })
      expect(route.points[1].customer.address).toBeUndefined()
    })

    it("tolerates a route with no points array", () => {
      const route = mapCachedRoute({ id: "r2", date: "2026-07-20", status: "PLANNED" })
      expect(route.points).toEqual([])
      expect(route.totalPoints).toBe(0)
    })
  })

  describe("selectActiveRoute", () => {
    const now = new Date("2026-07-19T10:00:00.000Z")

    it("picks the most-recent active route dated today or later", () => {
      const routes = [
        { id: "old", date: "2026-07-18T00:00:00.000Z", status: "PLANNED" },
        { id: "today", date: "2026-07-19T00:00:00.000Z", status: "IN_PROGRESS" },
        { id: "future", date: "2026-07-21T00:00:00.000Z", status: "PLANNED" },
      ]
      expect(selectActiveRoute(routes, now)?.id).toBe("future")
    })

    it("ignores past and non-active routes", () => {
      const routes = [
        { id: "yesterday", date: "2026-07-18T00:00:00.000Z", status: "PLANNED" },
        { id: "done", date: "2026-07-19T00:00:00.000Z", status: "COMPLETED" },
      ]
      expect(selectActiveRoute(routes, now)).toBeNull()
    })
  })

  describe("readOfflineRoute", () => {
    it("returns the active cached route for the scope", async () => {
      await applySyncChanges(
        "tenant-a",
        "agent-a",
        {
          routes: {
            updated: [
              { id: "r1", date: "2026-07-19T00:00:00.000Z", status: "PLANNED", points: [{ id: "p1", orderIndex: 0, status: "PENDING", customer: { id: "c1", name: "Clinic" } }] },
            ],
          },
        },
        "v1",
      )
      const route = await readOfflineRoute("tenant-a", "agent-a", new Date("2026-07-19T08:00:00.000Z"))
      expect(route?.id).toBe("r1")
      expect(route?.points).toHaveLength(1)
    })

    it("returns null when nothing active is cached", async () => {
      expect(await readOfflineRoute("tenant-empty", "agent-a", new Date("2026-07-19T08:00:00.000Z"))).toBeNull()
    })
  })

  describe("offline organizations", () => {
    it("maps a cached customer to the lighter organization shape", () => {
      const org = mapCachedOrganization({
        id: "c1",
        name: "Clinic One",
        code: "CL-1",
        category: "A",
        address: "Baku, Nizami 12",
        city: "Baku",
        phone: "+994501112233",
        latitude: 40.4,
        longitude: 49.8,
      })
      expect(org).toEqual({
        id: "c1",
        name: "Clinic One",
        code: "CL-1",
        category: "A",
        address: "Baku, Nizami 12",
        city: "Baku",
        phone: "+994501112233",
      })
    })

    it("matches search across name, code, address, phone and city", () => {
      const org = mapCachedOrganization({ id: "c1", name: "Aptek 7", code: "AP7", address: "Nizami", city: "Ganja", phone: "055" })
      expect(matchesOrganizationSearch(org, "aptek")).toBe(true)
      expect(matchesOrganizationSearch(org, "ap7")).toBe(true)
      expect(matchesOrganizationSearch(org, "ganja")).toBe(true)
      expect(matchesOrganizationSearch(org, "")).toBe(true)
      expect(matchesOrganizationSearch(org, "moscow")).toBe(false)
    })

    it("reads, filters and sorts cached organizations for the scope", async () => {
      await applySyncChanges(
        "tenant-a",
        "agent-a",
        {
          customers: {
            updated: [
              { id: "c2", name: "Zeta Pharmacy", city: "Baku" },
              { id: "c1", name: "Alpha Clinic", city: "Baku" },
              { id: "c3", name: "Beta Store", city: "Ganja" },
            ],
          },
        },
        "v1",
      )
      const all = await readOfflineOrganizations("tenant-a", "agent-a")
      expect(all.map((o) => o.name)).toEqual(["Alpha Clinic", "Beta Store", "Zeta Pharmacy"])
      const baku = await readOfflineOrganizations("tenant-a", "agent-a", "baku")
      expect(baku.map((o) => o.id)).toEqual(["c1", "c2"])
      expect(await readOfflineOrganizations("tenant-b", "agent-a")).toEqual([])
    })
  })

  describe("offline contacts", () => {
    it("maps a cached contact record to the list shape (no workplace offline)", () => {
      const c = mapCachedContact({
        id: "k1", displayName: "Dr. A", specialtyName: "Cardio", type: "DOCTOR", category: "A", phone: "+994", email: "a@x.az",
      })
      expect(c).toEqual({ id: "k1", name: "Dr. A", specialty: "Cardio", type: "DOCTOR", category: "A", phone: "+994", workplace: undefined })
    })

    it("matches search across name, specialty and phone", () => {
      const c = mapCachedContact({ id: "k1", displayName: "Aliyev", specialtyName: "Neuro", phone: "055" })
      expect(matchesContactSearch(c, "aliyev")).toBe(true)
      expect(matchesContactSearch(c, "neuro")).toBe(true)
      expect(matchesContactSearch(c, "055")).toBe(true)
      expect(matchesContactSearch(c, "")).toBe(true)
      expect(matchesContactSearch(c, "zzz")).toBe(false)
    })

    it("reads, filters and sorts cached contacts for the scope", async () => {
      await applySyncChanges(
        "tenant-a",
        "agent-a",
        {
          contacts: {
            updated: [
              { id: "k2", displayName: "Zeta", specialtyName: "Cardio" },
              { id: "k1", displayName: "Alpha", specialtyName: "Cardio" },
            ],
          },
        },
        "v1",
      )
      const all = await readOfflineContacts("tenant-a", "agent-a")
      expect(all.map((c) => c.name)).toEqual(["Alpha", "Zeta"])
      const cardio = await readOfflineContacts("tenant-a", "agent-a", "cardio")
      expect(cardio.map((c) => c.id)).toEqual(["k1", "k2"])
      expect(await readOfflineContacts("tenant-b", "agent-a")).toEqual([])
    })
  })

  describe("i18n contract", () => {
    it.each([["en", en], ["ru", ru], ["az", az]])(
      'common.offlineCached is present and non-empty in %s',
      (_lang, locale) => {
        const value = (locale as { common: { offlineCached?: unknown } }).common.offlineCached
        expect(typeof value).toBe("string")
        expect((value as string).length).toBeGreaterThan(0)
      },
    )

    const ORG_KEYS = ["title", "searchPlaceholder", "empty", "emptySearch", "objectPharmacy"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])(
      "organizations namespace + navV2.base are present in %s",
      (lang, locale) => {
        const org = (locale as { organizations: Record<string, unknown> }).organizations
        for (const key of ORG_KEYS) {
          expect(typeof org[key]).toBe("string")
          expect((org[key] as string).length).toBeGreaterThan(0)
        }
        const nav = (mobileResources as Record<string, { navV2: { base?: unknown } }>)[lang].navV2
        expect(typeof nav.base).toBe("string")
        expect((nav.base as string).length).toBeGreaterThan(0)
      },
    )
  })
})
