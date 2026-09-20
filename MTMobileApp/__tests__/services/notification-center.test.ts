import fs from "fs"
import path from "path"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_READ_LIMIT,
  buildNotifications,
  mergeReadIds,
  unreadCount,
} from "../../src/services/notification-center"

const copy = {
  messageFrom: (name: string) => (name ? `Сообщение от ${name}` : "Сообщение команды"),
  requestApproved: (name: string) => `${name}: заявка одобрена`,
  requestRejected: (name: string) => `${name}: заявка отклонена`,
  requestNeedsInfo: (name: string) => `${name}: нужны уточнения`,
  taskOverdue: (title: string) => `Просрочено: ${title}`,
  taskToday: (title: string) => `Сегодня: ${title}`,
  visitLong: (minutes: number) => `Визит идёт ${minutes} мин`,
  workdayOpen: "Рабочий день не закрыт",
  workdayOpenBody: "Закройте день",
}

// Local time, because the rules that depend on the hour depend on the hour
// the agent sees on their phone.
const evening = new Date(2026, 8, 20, 20, 30)
const midday = new Date(2026, 8, 20, 12, 0)

describe("notification centre", () => {
  it("gathers what the app already knows into one list", () => {
    const items = buildNotifications({
      copy,
      now: evening,
      sources: {
        messages: [{ id: "m1", subject: "Проверка", body: "текст", createdAt: "2026-09-20T13:13:00.000Z", senderName: "Leyla" }],
        requests: [{ id: "r1", status: "APPROVED", displayName: "Dr Test", reviewedAt: "2026-09-20T14:00:00.000Z" }],
        tasks: [{ id: "t1", title: "Позвонить", status: "PENDING", dueDate: new Date(2026, 8, 19, 10).toISOString() }],
        visit: { id: "v1", customerName: "ADV-Store 1", minutes: 75 },
        workday: { open: true },
      },
    })
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([
      "message:m1", "request:r1:APPROVED", "task:t1:overdue", "visit:v1:2",
    ]))
    expect(items.some((item) => item.kind === "workday")).toBe(true)
  })

  /**
   * A request still waiting is not news — the agent filed it. Only a decision
   * belongs here.
   */
  it("says nothing about a request that is still waiting", () => {
    const items = buildNotifications({
      copy,
      now: evening,
      sources: { requests: [{ id: "r2", status: "SUBMITTED", displayName: "Dr Wait", submittedAt: "2026-09-20T10:00:00.000Z" }] },
    })
    expect(items).toEqual([])
  })

  it("keeps future deadlines and finished tasks out of the way", () => {
    const items = buildNotifications({
      copy,
      now: evening,
      sources: {
        tasks: [
          { id: "future", title: "Через неделю", status: "PENDING", dueDate: new Date(2026, 8, 27, 10).toISOString() },
          { id: "done", title: "Сделано", status: "COMPLETED", dueDate: new Date(2026, 8, 19, 10).toISOString() },
        ],
      },
    })
    expect(items).toEqual([])
  })

  it("does not nag about the workday in the middle of it", () => {
    expect(buildNotifications({ copy, now: midday, sources: { workday: { open: true } } })).toEqual([])
    expect(buildNotifications({ copy, now: evening, sources: { workday: { open: true } } })).toHaveLength(1)
  })

  it("mentions a long visit once per half hour, not once a minute", () => {
    const at = (minutes: number) => buildNotifications({
      copy, now: evening, sources: { visit: { id: "v1", minutes } },
    })
    expect(at(29)).toEqual([])
    expect(at(31)[0].id).toBe("visit:v1:1")
    expect(at(59)[0].id).toBe("visit:v1:1")
    expect(at(61)[0].id).toBe("visit:v1:2")
  })

  it("respects what the agent switched off", () => {
    const items = buildNotifications({
      copy,
      now: evening,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, message: false },
      sources: { messages: [{ id: "m1", subject: "Проверка", createdAt: "2026-09-20T13:13:00.000Z" }] },
    })
    expect(items).toEqual([])
  })

  it("counts as read what the agent has already seen, here or in messages", () => {
    const sources = {
      messages: [{ id: "m1", subject: "Прочитано в списке", createdAt: "2026-09-20T13:13:00.000Z", read: true }],
      requests: [{ id: "r1", status: "REJECTED", displayName: "Dr Test", reviewedAt: "2026-09-20T14:00:00.000Z" }],
    }
    const first = buildNotifications({ copy, now: evening, sources })
    expect(unreadCount(first)).toBe(1)
    const second = buildNotifications({ copy, now: evening, sources, readIds: ["request:r1:REJECTED"] })
    expect(unreadCount(second)).toBe(0)
  })

  it("puts the newest first", () => {
    const items = buildNotifications({
      copy,
      now: evening,
      sources: {
        messages: [
          { id: "old", subject: "Старое", createdAt: "2026-09-20T08:00:00.000Z" },
          { id: "new", subject: "Новое", createdAt: "2026-09-20T15:00:00.000Z" },
        ],
      },
    })
    expect(items.map((item) => item.id)).toEqual(["message:new", "message:old"])
  })

  it("keeps the read list small without forgetting what is on screen", () => {
    const many = Array.from({ length: NOTIFICATION_READ_LIMIT + 50 }, (_, index) => `id-${index}`)
    const merged = mergeReadIds(many, ["fresh"])
    expect(merged[0]).toBe("fresh")
    expect(merged).toHaveLength(NOTIFICATION_READ_LIMIT)
  })
})

describe("notifications screen wiring", () => {
  const screen = fs.readFileSync(path.resolve(__dirname, "../../src/screens/more/NotificationsScreen.tsx"), "utf8")
  const more = fs.readFileSync(path.resolve(__dirname, "../../src/screens/more/MoreScreen.tsx"), "utf8")
  const navigator = fs.readFileSync(path.resolve(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"), "utf8")

  it("is reachable from the More tab", () => {
    expect(more).toContain('route: "Notifications"')
    expect(navigator).toContain('<MoreStack.Screen name="Notifications" component={NotificationsScreen} />')
  })

  /**
   * The old wording said push was off, full stop — true when nothing could
   * send, a lie the day the server could. The claim now follows the phone's
   * own last registration, and the one state that used to be invisible —
   * address registered, server with no key — has words of its own.
   */
  it("never claims a push it cannot send", () => {
    expect(screen).toContain("pushNote")
    expect(screen).toContain("Адрес есть, но сервер пока не отправляет push.")
    expect(screen).toContain("Google не выдал этому телефону адрес")
    expect(screen).toContain("{pushLine}")
  })

  it("survives a source that fails instead of emptying the list", () => {
    expect(screen).toContain("api.getMobileMessages().catch(() => null)")
    expect(screen).toContain("api.getDoctorCreateRequests(20).catch(() => null)")
    expect(screen).toContain("api.getTasks().catch(() => null)")
  })

  it("remembers read state and preferences on the device", () => {
    expect(screen).toContain('const READ_STORAGE_KEY = "@mtm_notifications_read_v1"')
    expect(screen).toContain('const PREFERENCES_STORAGE_KEY = "@mtm_notifications_preferences_v1"')
  })
})
