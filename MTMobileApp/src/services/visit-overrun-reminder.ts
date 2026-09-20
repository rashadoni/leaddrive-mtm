import { cancelReminder, scheduleReminder } from "./field-notifications"

/**
 * "You have been at this customer for half an hour."
 *
 * The 30-minute guidance existed only as a line on a screen the agent had to
 * be looking at, so a visit checked in at 03:52 was still open at 16:59 —
 * 787 minutes, found in the office card the next day. The phone knows when
 * the visit started; it can say so on its own.
 *
 * The reminder carries no customer name: it can appear on a locked screen in
 * front of whoever the agent is sitting with.
 */

export const VISIT_OVERRUN_MINUTES = 30
/** A second nudge for a visit that has quietly become the whole afternoon. */
export const VISIT_LONG_OVERRUN_MINUTES = 120

export const VISIT_OVERRUN_COPY = {
  ru: {
    title: "Визит идёт 30 минут",
    body: "Если работа с клиентом закончена, завершите визит в приложении.",
    longTitle: "Визит идёт больше двух часов",
    longBody: "Визит всё ещё открыт. Завершите его или продолжите — но он попадёт в отчёт как есть.",
  },
  az: {
    title: "Ziyarət 30 dəqiqədir davam edir",
    body: "Müştəri ilə iş bitibsə, ziyarəti tətbiqdə tamamlayın.",
    longTitle: "Ziyarət iki saatdan çoxdur davam edir",
    longBody: "Ziyarət hələ açıqdır. Tamamlayın və ya davam edin — hesabata olduğu kimi düşəcək.",
  },
  en: {
    title: "This visit has run 30 minutes",
    body: "If you are done with the customer, finish the visit in the app.",
    longTitle: "This visit has run over two hours",
    longBody: "The visit is still open. Finish it or carry on — the report will show it as it is.",
  },
} as const

export type VisitReminderLanguage = keyof typeof VISIT_OVERRUN_COPY

export function visitReminderLanguage(language: string): VisitReminderLanguage {
  const value = language.toLowerCase()
  if (value.startsWith("az")) return "az"
  if (value.startsWith("en")) return "en"
  return "ru"
}

/** Both reminders for one visit, so cancelling a visit cancels every alarm. */
export function visitReminderIds(visitId: string): string[] {
  return [`visit-overrun-${visitId}`, `visit-overrun-long-${visitId}`]
}

export interface VisitReminderPlan {
  id: string
  at: number
  title: string
  body: string
}

/**
 * What to schedule for a visit that started at `checkInAt`. A reminder whose
 * moment has already passed is dropped rather than fired immediately: an agent
 * opening the app on an old visit does not need to be scolded twice.
 */
export function visitOverrunPlan(input: {
  visitId: string
  checkInAt: string | number | Date
  language: string
  now?: number
}): VisitReminderPlan[] {
  const startedAt = input.checkInAt instanceof Date
    ? input.checkInAt.getTime()
    : typeof input.checkInAt === "number"
      ? input.checkInAt
      : Date.parse(input.checkInAt)
  if (!Number.isFinite(startedAt)) return []
  const now = input.now ?? Date.now()
  const copy = VISIT_OVERRUN_COPY[visitReminderLanguage(input.language)]
  const [shortId, longId] = visitReminderIds(input.visitId)
  return [
    { id: shortId, at: startedAt + VISIT_OVERRUN_MINUTES * 60_000, title: copy.title, body: copy.body },
    { id: longId, at: startedAt + VISIT_LONG_OVERRUN_MINUTES * 60_000, title: copy.longTitle, body: copy.longBody },
  ].filter((plan) => plan.at > now)
}

export async function scheduleVisitOverrunReminders(input: {
  visitId: string
  checkInAt: string | number | Date
  language: string
  now?: number
}): Promise<void> {
  const plans = visitOverrunPlan(input)
  await Promise.all(plans.map((plan) => scheduleReminder(plan)))
}

export async function cancelVisitOverrunReminders(visitId: string): Promise<void> {
  await Promise.all(visitReminderIds(visitId).map((id) => cancelReminder(id)))
}
