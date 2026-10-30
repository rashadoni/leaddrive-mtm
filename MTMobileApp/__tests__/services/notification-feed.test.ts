import fs from "fs"
import path from "path"
import {
  badgeLabel,
  buildNotificationFeed,
  feedNavigation,
  feedTargetLabel,
  feedTimeLabel,
  feedUnreadCount,
  pendingApprovalsFrom,
  toMessageThreads,
  toServerNotifications,
  type FeedContext,
  type ServerNotification,
} from "../../src/services/notification-feed"
import { FEED_COPY, feedCopy, formatDistance } from "../../src/services/notification-feed-copy"
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../../src/services/notification-center"

/**
 * The bell (owner, 2026-10-18): one list of everything, a red number for
 * what is unread, every line leading to its place. The rows below have the
 * shapes production holds — read from mtm_notifications on 2026-10-18 —
 * with invented ids and words.
 */

const az = FEED_COPY.az
const ru = FEED_COPY.ru
const now = new Date(2026, 9, 18, 15, 0)
const formatDay = (key: string) => `«${key}»`
const field: FeedContext = { shell: "field", selfId: "agent-self", attendanceRequests: true, ownWorkday: false }
const manager: FeedContext = { shell: "manager", selfId: "manager-self", attendanceRequests: false, ownWorkday: false }

function row(id: string, metadata: Record<string, unknown>, extra: Partial<ServerNotification> = {}): ServerNotification {
  return { id, title: "Server title", type: "info", isRead: false, metadata, createdAt: new Date(2026, 9, 18, 14, 0).toISOString(), ...extra }
}

function feed(input: Partial<Parameters<typeof buildNotificationFeed>[0]> & { sources: Parameters<typeof buildNotificationFeed>[0]["sources"] }) {
  return buildNotificationFeed({ context: field, copy: az, formatDay, now, ...input })
}

describe("what the server's inbox means, in the agent's language", () => {
  it("makes one line of a day's deviation alerts on one route, and says how many", () => {
    const rows = Array.from({ length: 73 }, (_, index) => row(`dev-${index}`, {
      routeId: "route-1",
      deviationMeters: 9600 + index,
      messageKey: "agentRouteDeviation",
    }, { type: "warning", title: "Route deviation", createdAt: new Date(2026, 9, 18, 8, index).toISOString() }))
    const items = feed({ sources: { server: rows } })
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe("Marşrutdan kənardasınız")
    expect(items[0].body).toBe("Siqnal: 73 · sonuncu 9,7 km")
    expect(items[0].alert).toBe(true)
    expect(items[0].target).toEqual({ screen: "Route" })
    expect(items[0].unreadServerIds).toHaveLength(73)
    expect(feedUnreadCount(items)).toBe(1)
  })

  it("keeps different days and routes apart", () => {
    const items = feed({
      sources: {
        server: [
          row("a", { routeId: "r1", deviationMeters: 700 }),
          row("b", { routeId: "r2", deviationMeters: 800 }),
          row("c", { routeId: "r1", deviationMeters: 900 }, { createdAt: new Date(2026, 9, 17, 12).toISOString() }),
        ],
      },
    })
    expect(items).toHaveLength(3)
    expect(items.find((item) => item.unreadServerIds.includes("b"))?.body).toBe("Marşrutdan 800 m")
  })

  it("makes a read deviation line new again when another alert comes", () => {
    const first = [row("a", { routeId: "r1", deviationMeters: 700 }, { isRead: true })]
    const before = feed({ sources: { server: first } })
    expect(before[0].read).toBe(true)
    const after = feed({
      sources: { server: [...first, row("b", { routeId: "r1", deviationMeters: 750 }, { createdAt: new Date(2026, 9, 18, 14, 30).toISOString() })] },
      readIds: [before[0].id],
    })
    expect(after[0].read).toBe(false)
    expect(after[0].unreadServerIds).toEqual(["b"])
  })

  it("says a route is ready, for which day, and opens the calendar for another day", () => {
    const items = feed({
      sources: {
        server: [
          row("p1", { routeId: "r1", publishedVersion: 1, event: "route_published" }, { type: "task", title: "Route published", body: "Route for 2026-10-21 is ready." }),
          row("p2", { routeId: "r2", publishedVersion: 2, event: "route_updated" }, { type: "task", title: "Route updated", body: "Route for 2026-10-18 was changed." }),
        ],
      },
    })
    const published = items.find((item) => item.id === "server:p1")!
    const updated = items.find((item) => item.id === "server:p2")!
    expect(published.title).toBe("Marşrut hazırdır")
    expect(published.body).toBe("«2026-10-21» üçün")
    expect(published.target).toEqual({ screen: "Calendar" })
    expect(updated.title).toBe("Marşrut dəyişdi")
    expect(updated.target).toEqual({ screen: "Route" })
  })

  // The owner's bug, 2026-10-30: the joint-visit line led nowhere when tapped.
  it("opens the route of the day a manager plans a joint visit for, in the server's own words", () => {
    const items = feed({
      sources: {
        server: [
          row("j1", { domain: "route", event: "joint_visit_planned", date: "2026-10-18", managerAgentId: "m1" }, { title: "Saida bu gün sizinlə birgə vizitə gedəcək", body: "Fictional Clinic." }),
          row("j2", { domain: "route", event: "joint_visit_planned", date: "2026-10-21", managerAgentId: "m1" }, { title: "Saida 21.10 sizinlə birgə vizitə gedəcək" }),
          row("j3", { domain: "route", jointSessionId: "s1", managerAgentId: "m1" }, { title: "Saida bu gün sizinlə birgə vizitdədir" }),
        ],
      },
    })
    const today = items.find((item) => item.id === "server:j1")!
    expect(today).toMatchObject({ kind: "route", title: "Saida bu gün sizinlə birgə vizitə gedəcək", body: "Fictional Clinic.", target: { screen: "Route" } })
    expect(items.find((item) => item.id === "server:j2")!.target).toEqual({ screen: "Calendar" })
    expect(items.find((item) => item.id === "server:j3")!.target).toEqual({ screen: "Route" })
  })

  /** Production held «Müraciət təsdiqləndi» beside «Заявка одобрена»: the phone says it in one language. */
  it("words an attendance decision in the app's language, whatever the server wrote", () => {
    const rows = [
      row("d1", { domain: "route", attendanceRequestId: "req-1", status: "APPROVED" }, { title: "Müraciət təsdiqləndi" }),
      row("d2", { domain: "route", attendanceRequestId: "req-2", status: "REJECTED" }, { title: "Заявка отклонена", type: "warning" }),
    ]
    const items = buildNotificationFeed({ context: field, copy: ru, formatDay, now, sources: { server: rows } })
    expect(items.map((item) => item.title).sort()).toEqual(["Заявка одобрена", "Заявка отклонена"])
    expect(items[0].target).toEqual({ screen: "AttendanceRequests" })
  })

  it("does not offer «Sorğularım» to an agent whose company switched it off", () => {
    const items = feed({
      context: { ...field, attendanceRequests: false },
      sources: { server: [row("d1", { domain: "route", attendanceRequestId: "req-1", status: "APPROVED" })] },
    })
    expect(items[0].title).toBe("Sorğu təsdiqləndi")
    expect(items[0].target).toBeUndefined()
  })

  it("opens the card a decision is about", () => {
    const items = feed({
      sources: {
        server: [
          row("c1", { contactChangeRequestId: "cc-1", contactId: "contact-1", decision: "NEEDS_INFO" }, { body: "Telefonu yoxlayın" }),
          row("l1", { kind: "customer_location_request_decision", requestId: "loc-1", customerId: "org-1", decision: "APPROVED" }),
          row("n1", { requestId: "cr-1", customerId: "org-2", routeId: "route-1" }),
        ],
      },
    })
    expect(items.find((item) => item.id === "server:c1")).toMatchObject({
      title: "Əlaqə dəyişikliyi sorğusu dəqiqləşdirmə tələb edir",
      body: "Telefonu yoxlayın",
      target: { screen: "ContactDetail", id: "contact-1" },
    })
    expect(items.find((item) => item.id === "server:l1")).toMatchObject({
      title: "Müştəri yeri sorğusu təsdiqləndi",
      target: { screen: "OrganizationDetail", id: "org-1" },
    })
    expect(items.find((item) => item.id === "server:n1")).toMatchObject({
      title: "Yeni müştəri sorğusu təsdiqləndi",
      target: { screen: "OrganizationDetail", id: "org-2" },
    })
  })

  it("names a returned task, a visit left open and a check-in outside the zone", () => {
    const items = feed({
      sources: {
        server: [
          row("t1", { taskId: "task-1", reason: "Şəkil yoxdur", completionCycle: 1 }, { type: "warning" }),
          row("v1", { visitId: "visit-1", customerId: "org-1" }, { type: "warning" }),
          row("z1", { customerId: "org-1", distanceMeters: 340, geofenceRadius: 100 }, { type: "warning" }),
        ],
      },
    })
    expect(items.find((item) => item.id === "server:t1")).toMatchObject({ kind: "task", title: "Tapşırıq yenidən işə qaytarıldı", body: "Şəkil yoxdur", target: { screen: "Tasks" } })
    expect(items.find((item) => item.id === "server:v1")).toMatchObject({ kind: "visit", title: "Ziyarət hələ açıqdır", alert: true })
    expect(items.find((item) => item.id === "server:z1")).toMatchObject({ title: "Müştəri zonasından kənar qeydiyyat", body: "Müştəridən 340 m" })
  })

  it("keeps the server's own words for a kind it does not know", () => {
    const items = feed({ sources: { server: [row("x", {}, { title: "Something else", body: "Its body", type: "alert" })] } })
    expect(items[0]).toMatchObject({ kind: "other", title: "Something else", body: "Its body", target: undefined })
  })
})

describe("messages", () => {
  const threads = toMessageThreads({
    success: true,
    data: {
      threads: [
        { id: "th-1", unread: true, lastMessageAt: new Date(2026, 9, 18, 14, 50).toISOString(), lastMessage: { id: "m-1", senderAgentId: "boss", senderName: "Menecer", body: "Sabah 09:00-da görüş" } },
        { id: "th-2", unread: false, lastMessageAt: new Date(2026, 9, 18, 9).toISOString(), lastMessage: { id: "m-2", senderAgentId: "agent-self", senderName: "Mən", body: "Oldu" } },
      ],
    },
  })

  it("is one line per thread, read where the messages screen says it is read", () => {
    const items = feed({
      sources: {
        threads,
        server: [row("msg-row", { threadId: "th-1", messageId: "m-1" }, { type: "message", title: "Menecer" })],
      },
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: "message:th-1:m-1",
      kind: "message",
      title: "Menecer mesaj göndərdi",
      body: "Sabah 09:00-da görüş",
      read: false,
      target: { screen: "Messages", threadId: "th-1" },
      unreadServerIds: ["msg-row"],
    })
  })

  it("shows the server's message row when the threads did not load", () => {
    const items = feed({
      sources: { threads: null, server: [row("msg-row", { threadId: "th-1", messageId: "m-1" }, { type: "announcement", title: "Menecer", body: "Elan" })] },
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: "server:msg-row", kind: "message", title: "Menecer", body: "Elan" })
  })

  it("leaves out a thread whose last word is the agent's own", () => {
    const items = feed({ sources: { threads } })
    expect(items.some((item) => item.id.startsWith("message:th-2"))).toBe(false)
  })
})

describe("the manager's bell", () => {
  it("lists what waits for his decision and leads to «Təsdiqlər»", () => {
    const approvals = pendingApprovalsFrom({
      approvals: {
        contactChanges: [{ id: "cc-1", kind: "PHONE", requestedByAgent: { name: "Əməkdaş B" }, contact: { displayName: "Kontakt" } }],
        routeChanges: [{ id: "rc-1", changeType: "ADD_STOP", requestedByAgent: { name: "Əməkdaş C" } }],
      },
      attendance: [{ id: "att-1", employeeName: "Əməkdaş A", what: "İş vaxtı düzəlişi, 17 oktyabr", submittedAt: new Date(2026, 9, 18, 14, 55).toISOString() }],
      doctors: [{ id: "doc-1", agentName: "Əməkdaş D", displayName: "Həkim" }],
    })
    const items = buildNotificationFeed({ context: manager, copy: az, formatDay, now, sources: { approvals } })
    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining([
      "İş vaxtı sorğusu qərar gözləyir",
      "Yeni həkim sorğusu qərar gözləyir",
      "Əlaqə dəyişikliyi qərar gözləyir",
      "Marşrut dəyişikliyi qərar gözləyir",
    ]))
    expect(items.find((item) => item.id === "approval:attendance:att-1")?.body).toBe("Əməkdaş A — İş vaxtı düzəlişi, 17 oktyabr")
    // A type code is not a word a person reads.
    expect(items.find((item) => item.id === "approval:routeChange:rc-1")?.body).toBe("Əməkdaş C")
    expect(items.every((item) => item.target?.screen === "Approvals")).toBe(true)
    expect(feedUnreadCount(items)).toBe(4)
  })

  it("drops the server's «needs review» rows the queue already lists, and offers no tab he does not have", () => {
    const items = buildNotificationFeed({
      context: manager,
      copy: az,
      formatDay,
      now,
      sources: {
        server: [
          row("review-1", { contactChangeRequestId: "cc-1", contactId: "contact-1" }, { type: "task" }),
          row("review-2", { routeId: "r1", requestId: "rc-1", changeType: "ADD_STOP" }, { type: "task" }),
          row("review-3", { requestId: "cr-1", routeId: "r1" }, { type: "task" }),
          row("route-row", { routeId: "r1", deviationMeters: 500 }),
        ],
      },
    })
    expect(items).toHaveLength(1)
    expect(items[0].target).toBeUndefined()
  })

  it("does not compute an agent's reminders on the manager's phone", () => {
    const items = buildNotificationFeed({
      context: manager,
      copy: az,
      formatDay,
      now,
      sources: { local: { tasks: [{ id: "t1", title: "Zəng", status: "PENDING", dueDate: new Date(2026, 9, 17).toISOString() }] } },
    })
    expect(items).toEqual([])
  })
})

describe("the list itself", () => {
  it("gathers the phone's own reminders beside the server's lines", () => {
    const items = feed({
      sources: {
        server: [row("p1", { routeId: "r1", event: "route_published" }, { body: "Route for 2026-10-18 is ready." })],
        local: {
          tasks: [{ id: "t1", title: "Aptekə zəng", status: "PENDING", dueDate: new Date(2026, 9, 18, 18).toISOString() }],
          requests: [{ id: "dr-1", status: "APPROVED", displayName: "Həkim", reviewedAt: new Date(2026, 9, 16).toISOString() }],
        },
      },
    })
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining(["server:p1", "task:t1:today", "request:dr-1:APPROVED"]))
    expect(items.find((item) => item.id === "task:t1:today")?.target).toEqual({ screen: "Tasks" })
  })

  it("respects what the person switched off", () => {
    const items = feed({
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, route: false },
      sources: { server: [row("a", { routeId: "r1", deviationMeters: 700 })] },
    })
    expect(items).toEqual([])
  })

  it("forgets read lines after a month and keeps unread ones", () => {
    const old = new Date(2026, 8, 1).toISOString()
    const items = feed({
      sources: {
        server: [
          row("old-read", {}, { isRead: true, createdAt: old }),
          row("old-unread", {}, { createdAt: old }),
        ],
      },
    })
    expect(items.map((item) => item.id)).toEqual(["server:old-unread"])
  })

  it("puts the newest first", () => {
    const items = feed({
      sources: {
        server: [
          row("early", {}, { createdAt: new Date(2026, 9, 18, 8).toISOString() }),
          row("late", {}, { createdAt: new Date(2026, 9, 18, 12).toISOString() }),
        ],
      },
    })
    expect(items.map((item) => item.id)).toEqual(["server:late", "server:early"])
  })

  it("reads the server's answers and refuses anything else", () => {
    expect(toServerNotifications({ success: false })).toBeNull()
    expect(toServerNotifications({ success: true, data: { items: [{ id: "a", title: "T", isRead: false, createdAt: "2026-10-18T10:00:00.000Z", metadata: null }, { title: "no id" }] } }))
      .toEqual([{ id: "a", title: "T", body: undefined, type: "info", isRead: false, metadata: {}, createdAt: "2026-10-18T10:00:00.000Z" }])
    expect(toMessageThreads(null)).toBeNull()
  })
})

describe("where a line leads and what its button says", () => {
  /** A plain navigate("Main") from the list would push a second copy of every tab. */
  it("goes back to the tabs for a tab, and pushes a card over the list", () => {
    expect(feedNavigation({ screen: "Messages", threadId: "th-1" })).toEqual({
      name: "Main",
      params: { screen: "More", params: { screen: "Messages", params: { threadId: "th-1" } } },
      pop: true,
    })
    expect(feedNavigation({ screen: "ContactDetail", id: "c1" })).toEqual({ name: "ContactDetail", params: { id: "c1" } })
    expect(feedNavigation({ screen: "Approvals" })).toEqual({ name: "Main", params: { screen: "Approvals" }, pop: true })
    expect(feedNavigation({ screen: "AttendanceRequests" })).toEqual({ name: "Main", params: { screen: "More", params: { screen: "AttendanceRequests" } }, pop: true })
    // A route for another day opens the month, which is a tab of «Маршрут» now.
    expect(feedNavigation({ screen: "Calendar" })).toEqual({ name: "Main", params: { screen: "Route", params: { view: "month" } }, pop: true })
    expect(fs.readFileSync(path.resolve(__dirname, "../../src/screens/more/NotificationsScreen.tsx"), "utf8"))
      .toContain("if (pop) navigation.navigate(name, params, { pop: true })")
  })

  it("names the place with a word", () => {
    expect(feedTargetLabel({ screen: "Route" }, az)).toBe("Marşrut")
    expect(feedTargetLabel({ screen: "OrganizationDetail", id: "o" }, az)).toBe("Kartı aç")
    expect(feedTargetLabel({ screen: "Approvals" }, ru)).toBe("Согласования")
  })

  it("says how long ago, then yesterday, then the date", () => {
    const date = (iso: string) => `date:${iso.slice(0, 10)}`
    expect(feedTimeLabel(new Date(2026, 9, 18, 14, 50).toISOString(), now, az, date)).toBe("10 dəq əvvəl")
    expect(feedTimeLabel(new Date(2026, 9, 18, 12, 0).toISOString(), now, az, date)).toBe("3 saat əvvəl")
    expect(feedTimeLabel(new Date(2026, 9, 17, 12, 0).toISOString(), now, az, date)).toBe("dünən")
    expect(feedTimeLabel(new Date(2026, 9, 10, 12, 0).toISOString(), now, az, date)).toMatch(/^date:2026-10-1/)
  })

  it("keeps the badge a circle", () => {
    expect(badgeLabel(4)).toBe("4")
    expect(badgeLabel(12)).toBe("9+")
  })
})

describe("the words", () => {
  it("are there in all three languages", () => {
    const shape = (value: unknown): unknown => (value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, typeof entry === "object" ? shape(entry) : typeof entry]))
      : typeof value)
    expect(shape(FEED_COPY.ru)).toEqual(shape(FEED_COPY.az))
    expect(shape(FEED_COPY.en)).toEqual(shape(FEED_COPY.az))
    for (const copy of Object.values(FEED_COPY)) {
      for (const word of Object.values(copy.target)) expect(word.length).toBeGreaterThan(0)
    }
  })

  it("follows the app language and writes distances its way", () => {
    expect(feedCopy("az-AZ").language).toBe("az")
    expect(feedCopy("en").language).toBe("en")
    expect(feedCopy(undefined).language).toBe("ru")
    expect(formatDistance(9640, az)).toBe("9,6 km")
    expect(formatDistance(9640, FEED_COPY.en)).toBe("9.6 km")
    expect(formatDistance(340, ru)).toBe("340 м")
  })
})

describe("the bell is in the corner of every main screen", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

  it("is on each tab of the agent and of the manager", () => {
    const missing = [
      "screens/today/TodayScreen.tsx",
      // «Маршрут» and its «Месяц» share one header, and the bell is in it.
      "screens/route/RouteSectionHeader.tsx",
      "screens/visit/VisitScreen.tsx",
      "screens/base/RouteBaseScreen.android.tsx",
      "screens/tasks/TasksScreen.tsx",
      "screens/more/MoreScreen.tsx",
      "screens/manager/ManagerWorkspaceScreen.android.tsx",
      "screens/manager/ManagerPlanningCalendarScreen.android.tsx",
      "screens/attendance/AttendanceWorkdayScreen.tsx",
      "screens/profile/ProfileScreen.tsx",
    ].filter((file) => !read(file).includes("<NotificationBell"))
    expect(missing).toEqual([])
  })

  it("does not cut the list's buttons to «Hamısını oxunmu…»", () => {
    const screen = read("screens/more/NotificationsScreen.tsx")
    expect(screen).toContain("<Text style={styles.secondaryButtonText} numberOfLines={2}>{copy.markAll}</Text>")
    expect(screen).not.toContain("<Text style={styles.secondaryButtonText} numberOfLines={1}>")
  })

  it("opens one list over the tabs, in both shells", () => {
    const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
    expect(navigator).toContain('{routeFieldAdmitted || managerShell ? <Stack.Screen name="Notifications" component={withFieldColorScheme(NotificationsScreen)} /> : null}')
    expect(navigator).not.toContain('<MoreStack.Screen name="Notifications"')
    expect(read("components/NotificationBell.tsx")).toContain('navigation.navigate("Notifications")')
  })

  it("opens the thread a message line is about", () => {
    const messages = read("screens/more/TeamMessagesScreen.tsx")
    expect(messages).toContain("const openThreadId = (route.params as { threadId?: string } | undefined)?.threadId")
    expect(messages).toContain('if (thread.unread) receipt(thread, "READ").catch(() => {})')
  })

  it("asks again the moment a push arrives in the open app", () => {
    const service = fs.readFileSync(path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/FieldPushService.kt"), "utf8")
    expect(service).toContain('const val MESSAGE_EVENT = "FieldPushMessage"')
    expect(service).toContain("FieldPushModule.announceMessage()")
    expect(read("services/push-lifecycle.ts")).toContain('export const PUSH_MESSAGE_EVENT = "FieldPushMessage"')
    expect(read("store/notification-inbox.ts")).toContain("DeviceEventEmitter.addListener(PUSH_MESSAGE_EVENT")
  })

  it("marks read on the server what it marks read on the phone", () => {
    const store = read("store/notification-inbox.ts")
    expect(store).toContain("api.markMobileNotificationsRead(ids.slice(index, index + 100))")
    expect(store).toContain("api.markAllMobileNotificationsRead()")
    expect(read("services/api.ts")).toContain('JSON.stringify({ all: true, isRead: true })')
  })
})
