import AsyncStorage from "@react-native-async-storage/async-storage"
import { applySyncChanges } from "../../src/services/sync-cache"
import { mapCachedTask, readOfflineTasks } from "../../src/services/offline-reads"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

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

  describe("i18n contract", () => {
    it.each([["en", en], ["ru", ru], ["az", az]])(
      'common.offlineCached is present and non-empty in %s',
      (_lang, locale) => {
        const value = (locale as { common: { offlineCached?: unknown } }).common.offlineCached
        expect(typeof value).toBe("string")
        expect((value as string).length).toBeGreaterThan(0)
      },
    )
  })
})
