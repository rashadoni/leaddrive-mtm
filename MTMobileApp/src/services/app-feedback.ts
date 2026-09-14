import { createStore } from "zustand/vanilla"

/**
 * The app's own notices and choices, instead of the system `Alert.alert`.
 *
 * Route tab, 2026-09-14: after «Giriş yadda saxlanıldı» and «Çıxış yadda
 * saxlanıldı» the owner got Android's dark grey dialog with a teal «OK» and
 * asked twice why a message of the app looks like a system window. Every
 * screen now says it through this module, and one host at the app root
 * (`components/AppFeedbackHost.tsx`) draws it in the app's colours.
 *
 * No React and no React Native here: the store is a plain zustand vanilla
 * store, so the queueing rules are unit-tested without rendering anything.
 */

export type FeedbackTone = "success" | "error" | "warning" | "info"

export type AppChoiceButtonStyle = "default" | "cancel" | "destructive"

export interface NotifyInput {
  tone: FeedbackTone
  title: string
  message?: string
  /** How long the notice stays when nothing waits behind it. */
  durationMs?: number
}

export interface AppNotice {
  id: number
  tone: FeedbackTone
  title: string
  message?: string
  durationMs: number
}

export interface AppChoiceButton<T> {
  text: string
  value: T
  style?: AppChoiceButtonStyle
}

export interface AskInput<T> {
  title: string
  message?: string
  tone?: FeedbackTone
  buttons: ReadonlyArray<AppChoiceButton<T>>
  /** What the promise resolves with when the agent closes the sheet with the
   * back button or a tap outside it, without pressing a button. */
  dismissValue: T
}

/** What the host draws. Values stay in this module; the host answers by index. */
export interface AppChoice {
  id: number
  title: string
  message?: string
  tone?: FeedbackTone
  buttons: ReadonlyArray<{ text: string; style: AppChoiceButtonStyle }>
}

export interface AppFeedbackState {
  notice: AppNotice | null
  /**
   * When the notice was first drawn, by whichever notice layer drew it first;
   * null until then and while an open choice hides it. One clock for every
   * layer: a sheet that opens with its own layer 3.5 s into a 4 s notice
   * shows the last half second, and the root layer's timer does not pull the
   * notice out from under a layer that has just drawn it.
   */
  noticeShownAt: number | null
  pendingNotices: AppNotice[]
  choice: AppChoice | null
  pendingChoices: AppChoice[]
}

/** Android's own dialogs allow three buttons; more do not fit a phone on its side. */
export const APP_CHOICE_MAX_BUTTONS = 3

/**
 * Notices waiting behind the one on screen. A burst (check-in saved, then a
 * sync conflict, then a photo queued) is read in order; beyond this the
 * oldest waiting one goes, since a newer notice describes the newer state.
 */
export const NOTICE_QUEUE_LIMIT = 3

/** Once something waits behind it, a notice stays at least this long. */
export const NOTICE_MIN_VISIBLE_MS = 1800

export const NOTICE_DURATION_MS = { min: 3000, max: 7000, perCharacter: 45, base: 2000 } as const

/**
 * A choice that takes the screen within this long of the previous answer
 * ignores presses for this long. The sheet stays open and the next choice's
 * buttons land where the answered ones were: a double tap on «Open settings»
 * would otherwise press «Check in anyway» behind it, unread (VisitScreen,
 * refused location permission followed by the out-of-zone question).
 */
export const CHOICE_SWAP_GUARD_MS = 350

const initialState = (): AppFeedbackState => ({
  notice: null,
  noticeShownAt: null,
  pendingNotices: [],
  choice: null,
  pendingChoices: [],
})

export const appFeedbackStore = createStore<AppFeedbackState>(() => initialState())

type Pending = { values: unknown[]; dismissValue: unknown; resolve: (value: unknown) => void }

const resolvers = new Map<number, Pending>()
let nextId = 1
let lastAnsweredAt = Number.NEGATIVE_INFINITY
let swapGuard: { id: number; until: number } | null = null

/**
 * Reading time grows with the text: a title alone is gone in 3 s, a body that
 * names the customer and the distance gets longer (capped, so a long message
 * does not sit over the screen).
 */
export function noticeDurationMs(title: string, message?: string): number {
  const characters = title.length + (message?.length ?? 0)
  const raw = NOTICE_DURATION_MS.base + characters * NOTICE_DURATION_MS.perCharacter
  return Math.min(NOTICE_DURATION_MS.max, Math.max(NOTICE_DURATION_MS.min, raw))
}

/**
 * How much longer the notice on screen stays. Alone it keeps its full time;
 * with a successor waiting it yields after NOTICE_MIN_VISIBLE_MS, so a queue
 * of three is not twenty seconds of reading.
 */
export function noticeRemainingMs(input: {
  shownAt: number
  now: number
  durationMs: number
  hasSuccessor: boolean
}): number {
  const elapsed = Math.max(0, input.now - input.shownAt)
  const budget = input.hasSuccessor ? Math.min(input.durationMs, NOTICE_MIN_VISIBLE_MS) : input.durationMs
  return Math.max(0, budget - elapsed)
}

function sameNotice(a: AppNotice, b: Omit<AppNotice, "id" | "durationMs">): boolean {
  return a.tone === b.tone && a.title === b.title && (a.message ?? "") === (b.message ?? "")
}

/**
 * A non-blocking notice: replaces the system `Alert.alert` with a title, a
 * body and only «OK». Returns the notice id. The same text twice in a row (a
 * sync that reports the same conflict again) is shown once.
 */
export function notify(input: NotifyInput): number {
  const draft = {
    tone: input.tone,
    title: input.title,
    message: input.message || undefined,
  }
  const state = appFeedbackStore.getState()
  const duplicate = [state.notice, ...state.pendingNotices].find(
    (notice): notice is AppNotice => notice !== null && sameNotice(notice, draft),
  )
  if (duplicate) return duplicate.id

  const notice: AppNotice = {
    ...draft,
    id: nextId++,
    durationMs: input.durationMs && input.durationMs > 0
      ? input.durationMs
      : noticeDurationMs(draft.title, draft.message),
  }
  if (!state.notice) {
    appFeedbackStore.setState({ notice, noticeShownAt: null })
  } else {
    appFeedbackStore.setState({
      pendingNotices: [...state.pendingNotices, notice].slice(-NOTICE_QUEUE_LIMIT),
    })
  }
  return notice.id
}

/** The host calls this when the notice timed out or was tapped. Idempotent. */
export function dismissNotice(id: number): void {
  const state = appFeedbackStore.getState()
  if (state.notice?.id === id) {
    const [next, ...rest] = state.pendingNotices
    appFeedbackStore.setState({ notice: next ?? null, noticeShownAt: null, pendingNotices: rest })
  } else if (state.pendingNotices.some((notice) => notice.id === id)) {
    appFeedbackStore.setState({ pendingNotices: state.pendingNotices.filter((notice) => notice.id !== id) })
  }
}

/**
 * A notice layer drew the notice `id`. The first call starts its clock; later
 * calls, from the other layers, return that same time. Null when `id` is not
 * the notice on screen.
 */
export function markNoticeShown(id: number, now: number = Date.now()): number | null {
  const state = appFeedbackStore.getState()
  if (state.notice?.id !== id) return null
  if (state.noticeShownAt !== null) return state.noticeShownAt
  appFeedbackStore.setState({ noticeShownAt: now })
  return now
}

/**
 * A blocking choice: replaces the system `Alert.alert` with buttons, and the
 * pattern of a `new Promise` resolved from those buttons' `onPress`. Resolves
 * with the pressed button's value, or with `dismissValue` when the sheet is
 * closed without a button. A second ask while one is open waits for it;
 * neither is dropped nor answered on the agent's behalf.
 */
export function ask<T>(input: AskInput<T>): Promise<T> {
  const count = input.buttons.length
  if (count < 1 || count > APP_CHOICE_MAX_BUTTONS) {
    return Promise.reject(new Error(`ask() takes 1 to ${APP_CHOICE_MAX_BUTTONS} buttons, got ${count}`))
  }
  const choice: AppChoice = {
    id: nextId++,
    title: input.title,
    message: input.message || undefined,
    tone: input.tone,
    buttons: input.buttons.map((button) => ({ text: button.text, style: button.style ?? "default" })),
  }
  return new Promise<T>((resolve) => {
    resolvers.set(choice.id, {
      values: input.buttons.map((button) => button.value),
      dismissValue: input.dismissValue,
      resolve: resolve as (value: unknown) => void,
    })
    const state = appFeedbackStore.getState()
    if (!state.choice) {
      armSwapGuard(choice.id)
      // The notice under the sheet stops its clock and gets its reading time
      // again once the choice closes.
      appFeedbackStore.setState({ choice, noticeShownAt: null })
    } else {
      appFeedbackStore.setState({ pendingChoices: [...state.pendingChoices, choice] })
    }
  })
}

/** Guards `id` when it takes the screen right after an answer; see CHOICE_SWAP_GUARD_MS. */
function armSwapGuard(id: number, now: number = Date.now()): void {
  swapGuard = now - lastAnsweredAt < CHOICE_SWAP_GUARD_MS ? { id, until: now + CHOICE_SWAP_GUARD_MS } : null
}

function settleChoice(id: number, pick: (pending: Pending) => unknown): void {
  const state = appFeedbackStore.getState()
  // Only the choice on screen can be answered: a tap on a sheet that is
  // already fading out cannot answer the one still queued.
  if (state.choice?.id !== id) return
  // A choice that replaced the one just answered is not answered by the
  // second tap of the same double tap: that touch is new, lands on this
  // choice's own button and carries its id, so only time tells it apart.
  const now = Date.now()
  if (swapGuard?.id === id && now < swapGuard.until) return
  const pending = resolvers.get(id)
  resolvers.delete(id)
  lastAnsweredAt = now
  const [next, ...rest] = state.pendingChoices
  if (next) armSwapGuard(next.id, now)
  appFeedbackStore.setState({ choice: next ?? null, pendingChoices: rest })
  pending?.resolve(pick(pending))
}

/** The agent pressed the button at `buttonIndex` of the choice `id`. */
export function answerChoice(id: number, buttonIndex: number): void {
  settleChoice(id, (pending) =>
    buttonIndex >= 0 && buttonIndex < pending.values.length ? pending.values[buttonIndex] : pending.dismissValue,
  )
}

/** Back button or a tap outside the sheet: resolves with `dismissValue`. */
export function dismissChoice(id: number): void {
  settleChoice(id, (pending) => pending.dismissValue)
}

/**
 * Closes the open choice and every waiting one, each resolving with its
 * `dismissValue`. A session that ends (logout, revoked device) tears the
 * screens down; a «Yenə də başla» left over the login screen would otherwise
 * answer for a screen that is gone. Notices stay: they may explain the logout.
 */
export function dismissAllChoices(): void {
  const pending = [...resolvers.values()]
  resolvers.clear()
  swapGuard = null
  appFeedbackStore.setState({ choice: null, pendingChoices: [] })
  for (const entry of pending) entry.resolve(entry.dismissValue)
}

/** Clears notices and choices; no caller of ask() stays suspended. For tests. */
export function resetAppFeedback(): void {
  dismissAllChoices()
  lastAnsweredAt = Number.NEGATIVE_INFINITY
  appFeedbackStore.setState(initialState())
}
