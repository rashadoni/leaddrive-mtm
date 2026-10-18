/**
 * The bell's words in the app's three languages.
 *
 * The server writes most notification titles in English («Route deviation»,
 * «Route published») and the rest in whatever language the request was
 * decided in — on the owner's phone (2026-10-18) the same list held
 * «Müraciət təsdiqləndi» next to «Заявка одобрена». So the phone says what a
 * notification means in the agent's language, from its metadata, and keeps
 * the server's text only for a kind it does not know.
 */

export type FeedLanguage = "az" | "ru" | "en"

export type RequestSubject =
  | "request"
  | "contactChange"
  | "routeChange"
  | "customer"
  | "location"
  | "hr"
  | "installation"

export type RequestOutcome = "approved" | "rejected" | "needsInfo" | "cancelled" | "rescheduled"

export type ApprovalSubject = "attendance" | "doctor" | "contactChange" | "customer" | "routeChange" | "hr"

export type TargetLabel =
  | "Messages"
  | "Tasks"
  | "Route"
  | "Calendar"
  | "Today"
  | "Clients"
  | "AttendanceRequests"
  | "OwnRequests"
  | "OwnExplanations"
  | "Card"
  | "Approvals"
  | "OwnWorkday"

export interface FeedCopy {
  language: FeedLanguage
  messageFrom: (name: string) => string
  routeDeviation: string
  deviationBody: (count: number, distance: string) => string
  outOfZone: string
  outOfZoneBody: (distance: string) => string
  visitStillOpen: string
  visitStillOpenBody: string
  taskReturned: string
  documentRequired: string
  documentNew: string
  routePublished: string
  routeUpdated: string
  routeFor: (date: string) => string
  requestSubject: Record<RequestSubject, string>
  requestOutcome: Record<RequestOutcome, string>
  explanationAsked: string
  explanationAccepted: string
  explanationRejected: string
  reminderStart: string
  reminderFinish: string
  approval: Record<ApprovalSubject, string>
  /* The local reminders notification-center builds. */
  doctorApproved: (name: string) => string
  doctorRejected: (name: string) => string
  doctorNeedsInfo: (name: string) => string
  taskOverdue: (title: string) => string
  taskToday: (title: string) => string
  visitLong: (minutes: number) => string
  workdayOpen: string
  workdayOpenBody: string
  /* Time and places. */
  justNow: string
  minutesAgo: (minutes: number) => string
  hoursAgo: (hours: number) => string
  yesterday: string
  target: Record<TargetLabel, string>
  meters: (value: number) => string
  kilometres: (value: string) => string
  decimalSeparator: string
}

export const FEED_COPY: Record<FeedLanguage, FeedCopy> = {
  az: {
    language: "az",
    messageFrom: (name) => (name ? `${name} mesaj göndərdi` : "Komanda mesajı"),
    routeDeviation: "Marşrutdan kənardasınız",
    deviationBody: (count, distance) => (count > 1 ? `Siqnal: ${count} · sonuncu ${distance}` : `Marşrutdan ${distance}`),
    outOfZone: "Müştəri zonasından kənar qeydiyyat",
    outOfZoneBody: (distance) => `Müştəridən ${distance}`,
    visitStillOpen: "Ziyarət hələ açıqdır",
    visitStillOpenBody: "Ziyarəti bitirməyi unutmayın.",
    taskReturned: "Tapşırıq yenidən işə qaytarıldı",
    documentRequired: "Məcburi sənəd",
    documentNew: "Yeni sənəd",
    routePublished: "Marşrut hazırdır",
    routeUpdated: "Marşrut dəyişdi",
    routeFor: (date) => `${date} üçün`,
    requestSubject: {
      request: "Sorğu",
      contactChange: "Əlaqə dəyişikliyi sorğusu",
      routeChange: "Marşrut dəyişikliyi sorğusu",
      customer: "Yeni müştəri sorğusu",
      location: "Müştəri yeri sorğusu",
      hr: "Kadr sorğusu",
      installation: "Telefon qeydiyyatı sorğusu",
    },
    requestOutcome: {
      approved: "təsdiqləndi",
      rejected: "rədd edildi",
      needsInfo: "dəqiqləşdirmə tələb edir",
      cancelled: "ləğv edildi",
      rescheduled: "başqa günə keçirildi",
    },
    explanationAsked: "İzahat istənilir",
    explanationAccepted: "İzahat qəbul edildi",
    explanationRejected: "İzahat qəbul edilmədi",
    reminderStart: "İş gününü başlamağı unutmayın",
    reminderFinish: "İş gününü bitirməyi unutmayın",
    approval: {
      attendance: "İş vaxtı sorğusu qərar gözləyir",
      doctor: "Yeni həkim sorğusu qərar gözləyir",
      contactChange: "Əlaqə dəyişikliyi qərar gözləyir",
      customer: "Yeni müştəri sorğusu qərar gözləyir",
      routeChange: "Marşrut dəyişikliyi qərar gözləyir",
      hr: "Kadr sorğusu qərar gözləyir",
    },
    doctorApproved: (name) => `${name}: sorğu təsdiqləndi`,
    doctorRejected: (name) => `${name}: sorğu rədd edildi`,
    doctorNeedsInfo: (name) => `${name}: dəqiqləşdirmə lazımdır`,
    taskOverdue: (title) => `Gecikmiş tapşırıq: ${title}`,
    taskToday: (title) => `Bu gün müddəti bitir: ${title}`,
    visitLong: (minutes) => `Ziyarət ${minutes} dəqiqədir davam edir`,
    workdayOpen: "İş günü hələ bağlanmayıb",
    workdayOpenBody: "İşi bitirəndə günü bağlayın.",
    justNow: "indicə",
    minutesAgo: (minutes) => `${minutes} dəq əvvəl`,
    hoursAgo: (hours) => `${hours} saat əvvəl`,
    yesterday: "dünən",
    target: {
      Messages: "Mesajlar",
      Tasks: "Tapşırıqlar",
      Route: "Marşrut",
      Calendar: "Təqvim",
      Today: "Bu gün",
      Clients: "Müştərilər",
      AttendanceRequests: "Sorğularım",
      OwnRequests: "Sorğularım",
      OwnExplanations: "İzahatlar",
      Card: "Kartı aç",
      Approvals: "Təsdiqlər",
      OwnWorkday: "İş günü",
    },
    meters: (value) => `${value} m`,
    kilometres: (value) => `${value} km`,
    decimalSeparator: ",",
  },
  ru: {
    language: "ru",
    messageFrom: (name) => (name ? `Сообщение от ${name}` : "Сообщение команды"),
    routeDeviation: "Вы отошли от маршрута",
    deviationBody: (count, distance) => (count > 1 ? `Сигналов: ${count} · последний — ${distance}` : `В ${distance} от маршрута`),
    outOfZone: "Отметка вне зоны клиента",
    outOfZoneBody: (distance) => `${distance} от клиента`,
    visitStillOpen: "Визит ещё не закрыт",
    visitStillOpenBody: "Не забудьте завершить визит.",
    taskReturned: "Задачу вернули на доработку",
    documentRequired: "Обязательный документ",
    documentNew: "Новый документ",
    routePublished: "Маршрут готов",
    routeUpdated: "Маршрут изменён",
    routeFor: (date) => `На ${date}`,
    requestSubject: {
      request: "Заявка",
      contactChange: "Заявка на изменение контакта",
      routeChange: "Заявка на изменение маршрута",
      customer: "Заявка на нового клиента",
      location: "Заявка на место клиента",
      hr: "Кадровая заявка",
      installation: "Заявка на регистрацию телефона",
    },
    requestOutcome: {
      approved: "одобрена",
      rejected: "отклонена",
      needsInfo: "требует уточнения",
      cancelled: "отменена",
      rescheduled: "перенесена на другой день",
    },
    explanationAsked: "Просят объяснительную",
    explanationAccepted: "Объяснительная принята",
    explanationRejected: "Объяснительная не принята",
    reminderStart: "Не забудьте начать рабочий день",
    reminderFinish: "Не забудьте закончить рабочий день",
    approval: {
      attendance: "Заявка по учёту времени ждёт решения",
      doctor: "Заявка на нового врача ждёт решения",
      contactChange: "Изменение контакта ждёт решения",
      customer: "Заявка на нового клиента ждёт решения",
      routeChange: "Изменение маршрута ждёт решения",
      hr: "Кадровая заявка ждёт решения",
    },
    doctorApproved: (name) => `${name}: заявка одобрена`,
    doctorRejected: (name) => `${name}: заявка отклонена`,
    doctorNeedsInfo: (name) => `${name}: нужны уточнения`,
    taskOverdue: (title) => `Просрочена задача: ${title}`,
    taskToday: (title) => `Сегодня срок задачи: ${title}`,
    visitLong: (minutes) => `Визит идёт ${minutes} мин`,
    workdayOpen: "Рабочий день ещё не закрыт",
    workdayOpenBody: "Закройте день, когда закончите работу.",
    justNow: "только что",
    minutesAgo: (minutes) => `${minutes} мин назад`,
    hoursAgo: (hours) => `${hours} ч назад`,
    yesterday: "вчера",
    target: {
      Messages: "Сообщения",
      Tasks: "Задачи",
      Route: "Маршрут",
      Calendar: "Календарь",
      Today: "Сегодня",
      Clients: "Клиенты",
      AttendanceRequests: "Мои заявки",
      OwnRequests: "Мои заявки",
      OwnExplanations: "Объяснительные",
      Card: "Открыть карточку",
      Approvals: "Согласования",
      OwnWorkday: "Рабочий день",
    },
    meters: (value) => `${value} м`,
    kilometres: (value) => `${value} км`,
    decimalSeparator: ",",
  },
  en: {
    language: "en",
    messageFrom: (name) => (name ? `Message from ${name}` : "Team message"),
    routeDeviation: "You are off your route",
    deviationBody: (count, distance) => (count > 1 ? `Alerts: ${count} · last ${distance}` : `${distance} from the route`),
    outOfZone: "Check-in outside the client's zone",
    outOfZoneBody: (distance) => `${distance} from the client`,
    visitStillOpen: "A visit is still open",
    visitStillOpenBody: "Remember to finish the visit.",
    taskReturned: "A task was returned for rework",
    documentRequired: "Required document",
    documentNew: "New document",
    routePublished: "Your route is ready",
    routeUpdated: "Your route changed",
    routeFor: (date) => `For ${date}`,
    requestSubject: {
      request: "Request",
      contactChange: "Contact change request",
      routeChange: "Route change request",
      customer: "New client request",
      location: "Client location request",
      hr: "HR request",
      installation: "Phone registration request",
    },
    requestOutcome: {
      approved: "approved",
      rejected: "declined",
      needsInfo: "needs more detail",
      cancelled: "cancelled",
      rescheduled: "moved to another day",
    },
    explanationAsked: "An explanation is requested",
    explanationAccepted: "Explanation accepted",
    explanationRejected: "Explanation not accepted",
    reminderStart: "Remember to start your workday",
    reminderFinish: "Remember to finish your workday",
    approval: {
      attendance: "A time request awaits your decision",
      doctor: "A new doctor request awaits your decision",
      contactChange: "A contact change awaits your decision",
      customer: "A new client request awaits your decision",
      routeChange: "A route change awaits your decision",
      hr: "An HR request awaits your decision",
    },
    doctorApproved: (name) => `${name}: request approved`,
    doctorRejected: (name) => `${name}: request declined`,
    doctorNeedsInfo: (name) => `${name}: more detail needed`,
    taskOverdue: (title) => `Overdue task: ${title}`,
    taskToday: (title) => `Due today: ${title}`,
    visitLong: (minutes) => `Visit running ${minutes} min`,
    workdayOpen: "The workday is still open",
    workdayOpenBody: "Close the day when you finish work.",
    justNow: "just now",
    minutesAgo: (minutes) => `${minutes} min ago`,
    hoursAgo: (hours) => `${hours} h ago`,
    yesterday: "yesterday",
    target: {
      Messages: "Messages",
      Tasks: "Tasks",
      Route: "Route",
      Calendar: "Calendar",
      Today: "Today",
      Clients: "Clients",
      AttendanceRequests: "My requests",
      OwnRequests: "My requests",
      OwnExplanations: "Explanations",
      Card: "Open card",
      Approvals: "Approvals",
      OwnWorkday: "Workday",
    },
    meters: (value) => `${value} m`,
    kilometres: (value) => `${value} km`,
    decimalSeparator: ".",
  },
}

export function feedLanguage(value: string | null | undefined): FeedLanguage {
  const normalized = (value ?? "").toLowerCase()
  if (normalized.startsWith("az")) return "az"
  if (normalized.startsWith("en")) return "en"
  return "ru"
}

export function feedCopy(language: string | null | undefined): FeedCopy {
  return FEED_COPY[feedLanguage(language)]
}

/** «340 m», «9,6 km» — whole metres below a kilometre, one decimal above. */
export function formatDistance(meters: number, copy: FeedCopy): string {
  if (!Number.isFinite(meters) || meters < 0) return ""
  if (meters < 1000) return copy.meters(Math.round(meters))
  const km = (Math.round(meters / 100) / 10).toFixed(1).replace(".", copy.decimalSeparator)
  return copy.kilometres(km)
}
