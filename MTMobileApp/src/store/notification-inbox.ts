import { create } from "zustand"
import { DeviceEventEmitter } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "../services/api"
import { managerApi } from "../services/manager-api"
import { i18n } from "../i18n"
import { useAuthStore } from "./auth"
import { useBootstrapStore } from "./bootstrap"
import { useWorkdayStore } from "./workday"
import { mainShell } from "../navigation/role-tabs"
import { hasOfficeAttendanceAccess } from "../services/attendance-access"
import { agentMayAttendanceRequests } from "../lib/agent-permissions"
import { offlineScopeKey } from "../services/offline-scope"
import { toDoctorCreateRequestItem } from "../services/doctor-create-requests"
import { attendanceKindLabel, attendancePeriod, toAttendanceApprovals, toDoctorRequestApprovals } from "../services/manager-approvals"
import { formatLocalizedDate } from "../lib/format-localized-date"
import { enqueueOutboxOperation } from "../services/outbox"
import { runMobileSync } from "../services/sync-engine"
import { PUSH_MESSAGE_EVENT } from "../services/push-lifecycle"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeReadIds,
  type NotificationPreferences,
} from "../services/notification-center"
import {
  buildNotificationFeed,
  feedUnreadCount,
  pendingApprovalsFrom,
  toMessageThreads,
  toServerNotifications,
  type FeedContext,
  type FeedItem,
  type FeedKind,
  type MessageThread,
  type PendingApproval,
  type ServerNotification,
} from "../services/notification-feed"
import { feedCopy } from "../services/notification-feed-copy"

/**
 * The bell's list, shared by every bell in the app and the list it opens.
 *
 * Each source answers for itself: one that fails keeps what it said last time
 * instead of emptying the lines of the others. Everything is kept per signed-in
 * person — the list of the previous one never shows under the next.
 */

const READ_STORAGE_KEY = "@mtm_notifications_read_v1"
const PREFERENCES_STORAGE_KEY = "@mtm_notifications_preferences_v1"

/** A tab switch refreshes the bell; one this soon after the last does not ask the server again. */
export const NOTIFICATION_MIN_REFRESH_MS = 15_000

interface InboxRaw {
  server: ServerNotification[] | null
  threads: MessageThread[] | null
  doctorRequests: unknown[] | null
  tasks: unknown[] | null
  approvals: PendingApproval[] | null
}

const EMPTY_RAW: InboxRaw = { server: null, threads: null, doctorRequests: null, tasks: null, approvals: null }

type InboxContext = FeedContext & { scope: string }

interface NotificationInboxState {
  scope: string | null
  context: InboxContext | null
  raw: InboxRaw
  items: FeedItem[]
  unread: number
  loading: boolean
  loadedAt: number | null
  readIds: string[]
  preferences: NotificationPreferences
  refresh: (options?: { force?: boolean }) => Promise<void>
  rebuild: () => void
  markRead: (item: FeedItem) => void
  markAllRead: () => Promise<void>
  setPreference: (kind: FeedKind, value: boolean) => void
}

/** Who holds the phone and which shell they see, decided the way the navigator decides it. */
function currentContext(): InboxContext | null {
  const agent = useAuthStore.getState().agent
  const scope = offlineScopeKey(agent?.organizationId, agent?.id)
  if (!agent || !scope) return null
  const boot = useBootstrapStore.getState()
  const data = boot.data
  const office = hasOfficeAttendanceAccess(data, agent)
  const shell = mainShell({ agent, data, routeFieldAccess: boot.routeFieldAccess, office })
  if (shell.kind === "field") {
    return { scope, shell: "field", selfId: agent.id, attendanceRequests: agentMayAttendanceRequests(data?.policies), ownWorkday: false }
  }
  if (shell.kind === "manager") {
    return {
      scope,
      shell: "manager",
      selfId: agent.id,
      attendanceRequests: office && agentMayAttendanceRequests(data?.policies),
      ownWorkday: office,
    }
  }
  return null
}

function formatDay(dateKey: string): string {
  return formatLocalizedDate(dateKey, i18n.language, { day: "numeric", month: "long", timeZone: "UTC" }) || dateKey
}

async function loadField(): Promise<Partial<InboxRaw>> {
  const [notifications, messages, requests, tasks] = await Promise.all([
    api.getMobileNotifications().catch(() => null),
    api.getMobileMessages().catch(() => null),
    api.getDoctorCreateRequests(20).catch(() => null),
    api.getTasks().catch(() => null),
  ])
  return {
    server: toServerNotifications(notifications),
    threads: toMessageThreads(messages),
    doctorRequests: Array.isArray(requests?.data?.requests) ? requests.data.requests : null,
    tasks: Array.isArray(tasks?.data?.tasks) ? tasks.data.tasks : null,
  }
}

async function loadManager(): Promise<Partial<InboxRaw>> {
  const [notifications, approvals, doctors] = await Promise.all([
    api.getMobileNotifications().catch(() => null),
    managerApi.getApprovals().catch(() => null),
    managerApi.getContactCreateRequests().catch(() => null),
  ])
  const data = (approvals as { data?: any } | null)?.data
  let pending: PendingApproval[] | null = null
  if (data) {
    const language = i18n.language
    const t = (key: string): string => String(i18n.t(key))
    const submitted = new Map<string, string | undefined>(
      (Array.isArray(data.attendance) ? data.attendance : []).map((row: any) => [String(row?.id), typeof row?.submittedAt === "string" ? row.submittedAt : undefined]),
    )
    pending = pendingApprovalsFrom({
      approvals: data,
      attendance: toAttendanceApprovals(data).map((item) => ({
        id: item.id,
        employeeName: item.employeeName,
        what: `${attendanceKindLabel(item, language, t)}, ${attendancePeriod(item, formatDay)}`,
        submittedAt: submitted.get(item.id),
      })),
      doctors: doctors ? toDoctorRequestApprovals((doctors as { data?: unknown }).data) : [],
    })
  }
  return { server: toServerNotifications(notifications), approvals: pending }
}

let inFlight: { scope: string; promise: Promise<void> } | null = null
let hydratedScope: string | null = null

async function hydrate(scope: string, set: (partial: Partial<NotificationInboxState>) => void) {
  if (hydratedScope === scope) return
  hydratedScope = scope
  try {
    const [storedRead, storedPreferences] = await Promise.all([
      AsyncStorage.getItem(READ_STORAGE_KEY),
      AsyncStorage.getItem(PREFERENCES_STORAGE_KEY),
    ])
    const readIds = storedRead ? JSON.parse(storedRead) : []
    const preferences = storedPreferences ? JSON.parse(storedPreferences) : {}
    set({
      readIds: Array.isArray(readIds) ? readIds.filter((id): id is string => typeof id === "string") : [],
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(preferences && typeof preferences === "object" ? preferences : {}) },
    })
  } catch {}
}

function persistRead(ids: string[]) {
  void AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids)).catch(() => {})
}

/** The server takes 100 ids per call; a day of deviation alerts can hold more. */
function markServerRead(ids: string[]) {
  for (let index = 0; index < ids.length; index += 100) {
    void api.markMobileNotificationsRead(ids.slice(index, index + 100)).catch(() => {})
  }
}

export const useNotificationInbox = create<NotificationInboxState>((set, get) => ({
  scope: null,
  context: null,
  raw: EMPTY_RAW,
  items: [],
  unread: 0,
  loading: false,
  loadedAt: null,
  readIds: [],
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,

  refresh: async ({ force = false } = {}) => {
    const context = currentContext()
    if (!context) {
      if (get().scope) set({ scope: null, context: null, raw: EMPTY_RAW, items: [], unread: 0, loadedAt: null })
      return
    }
    if (get().scope !== context.scope) {
      set({ scope: context.scope, context, raw: EMPTY_RAW, items: [], unread: 0, loadedAt: null })
    }
    await hydrate(context.scope, set)
    if (inFlight?.scope === context.scope) return inFlight.promise
    const loadedAt = get().loadedAt
    if (!force && loadedAt && Date.now() - loadedAt < NOTIFICATION_MIN_REFRESH_MS) {
      set({ context })
      get().rebuild()
      return
    }
    const promise = (async () => {
      set({ loading: true })
      try {
        const fresh = context.shell === "field" ? await loadField() : await loadManager()
        if (currentContext()?.scope !== context.scope || get().scope !== context.scope) return
        const previous = get().raw
        const raw: InboxRaw = {
          server: fresh.server ?? previous.server,
          threads: fresh.threads ?? previous.threads,
          doctorRequests: fresh.doctorRequests ?? previous.doctorRequests,
          tasks: fresh.tasks ?? previous.tasks,
          approvals: fresh.approvals ?? previous.approvals,
        }
        set({ raw, context, loadedAt: Date.now() })
        get().rebuild()
      } finally {
        if (get().scope === context.scope) set({ loading: false })
      }
    })()
    inFlight = { scope: context.scope, promise }
    try {
      await promise
    } finally {
      if (inFlight?.promise === promise) inFlight = null
    }
  },

  rebuild: () => {
    const { context, raw, readIds, preferences } = get()
    if (!context) return
    const workday = useWorkdayStore.getState().activeWorkday
    const items = buildNotificationFeed({
      context,
      copy: feedCopy(i18n.language),
      formatDay,
      preferences,
      readIds,
      sources: {
        server: raw.server,
        threads: raw.threads,
        approvals: raw.approvals,
        local: {
          requests: (raw.doctorRequests ?? [])
            .map(toDoctorCreateRequestItem)
            .filter((request): request is NonNullable<typeof request> => request !== null)
            .map((request) => ({
              id: request.id,
              status: request.status,
              displayName: request.displayName,
              clinicName: request.clinicName,
              decisionComment: request.decisionComment,
              reviewedAt: request.reviewedAt,
              submittedAt: request.submittedAt,
            })),
          tasks: (raw.tasks ?? []).map((task: any) => ({
            id: String(task?.id ?? ""),
            title: String(task?.title ?? ""),
            status: String(task?.status ?? ""),
            dueDate: typeof task?.dueDate === "string" ? task.dueDate : undefined,
          })).filter((task) => task.id && task.title),
          workday: workday ? { open: !workday.paused, startedAt: workday.startedAt } : null,
        },
      },
    })
    set({ items, unread: feedUnreadCount(items) })
  },

  markRead: (item) => {
    const state = get()
    const readIds = mergeReadIds(state.readIds, [item.id])
    const marked = new Set(item.unreadServerIds)
    set({
      readIds,
      raw: {
        ...state.raw,
        server: state.raw.server?.map((row) => (marked.has(row.id) ? { ...row, isRead: true } : row)) ?? null,
      },
    })
    persistRead(readIds)
    get().rebuild()
    if (item.unreadServerIds.length > 0) markServerRead(item.unreadServerIds)
  },

  markAllRead: async () => {
    const state = get()
    const context = state.context
    if (!context) return
    const readIds = mergeReadIds(state.readIds, state.items.map((item) => item.id))
    const unreadRows = (state.raw.server ?? []).some((row) => !row.isRead)
    const unreadThreads = context.shell === "field" ? (state.raw.threads ?? []).filter((thread) => thread.unread && thread.lastMessage) : []
    set({
      readIds,
      raw: {
        ...state.raw,
        server: state.raw.server?.map((row) => ({ ...row, isRead: true })) ?? null,
        threads: state.raw.threads?.map((thread) => ({ ...thread, unread: false })) ?? null,
      },
    })
    persistRead(readIds)
    get().rebuild()
    if (unreadRows) void api.markAllMobileNotificationsRead().catch(() => {})
    // A message marked read here is read in «Komanda mesajları» too: the same
    // receipt the messages screen sends when a thread is opened.
    if (unreadThreads.length > 0) {
      try {
        for (const thread of unreadThreads) {
          const messageId = thread.lastMessage!.id
          await enqueueOutboxOperation({
            entity: "messageReceipts",
            op: "create",
            data: { messageId, type: "READ", clientReceiptId: `read-${messageId}`, occurredAt: new Date().toISOString() },
          }, context.scope)
        }
        void runMobileSync().catch(() => {})
      } catch {}
    }
  },

  setPreference: (kind, value) => {
    const preferences = { ...get().preferences, [kind]: value }
    set({ preferences })
    void AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences)).catch(() => {})
    get().rebuild()
  },
}))

/** The badge, only for the person whose list it is. */
export function useNotificationUnread(): number {
  const agent = useAuthStore((state) => state.agent)
  const scope = useNotificationInbox((state) => state.scope)
  const unread = useNotificationInbox((state) => state.unread)
  return scope && scope === offlineScopeKey(agent?.organizationId, agent?.id) ? unread : 0
}

let pushListening = false

/**
 * A push that arrives while the app is open refreshes the bell at once
 * (FieldPushService → FieldPushModule.announceMessage), instead of at the
 * next tab switch.
 */
export function listenForPushRefresh() {
  if (pushListening) return
  pushListening = true
  DeviceEventEmitter.addListener(PUSH_MESSAGE_EVENT, () => {
    void useNotificationInbox.getState().refresh({ force: true }).catch(() => {})
  })
}
