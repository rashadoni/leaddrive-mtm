import {
  APP_CHOICE_MAX_BUTTONS,
  CHOICE_SWAP_GUARD_MS,
  NOTICE_DURATION_MS,
  NOTICE_MIN_VISIBLE_MS,
  NOTICE_QUEUE_LIMIT,
  answerChoice,
  appFeedbackStore,
  ask,
  dismissAllChoices,
  dismissChoice,
  dismissNotice,
  markNoticeShown,
  noticeDurationMs,
  noticeRemainingMs,
  notify,
  resetAppFeedback,
} from "../../src/services/app-feedback"

/**
 * The app's notices and choices replace `Alert.alert` (Route tab, 2026-09-14:
 * the owner saw Android's grey dialog after check-in and check-out). These are
 * the queueing rules the host relies on; nothing here renders.
 */

const state = () => appFeedbackStore.getState()
const titles = () => [state().notice?.title, ...state().pendingNotices.map((notice) => notice.title)]

// The store reads Date.now() for the swap guard; tests move this clock by hand.
let clock = 1_000_000

beforeEach(() => {
  clock = 1_000_000
  jest.spyOn(Date, "now").mockImplementation(() => clock)
  resetAppFeedback()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("notify", () => {
  it("shows the first notice at once, with a reading time for its text", () => {
    const id = notify({ tone: "success", title: "Giriş yadda saxlanıldı", message: "Müştəri: Aptek 24" })
    expect(state().notice).toEqual({
      id,
      tone: "success",
      title: "Giriş yadda saxlanıldı",
      message: "Müştəri: Aptek 24",
      durationMs: noticeDurationMs("Giriş yadda saxlanıldı", "Müştəri: Aptek 24"),
    })
    expect(state().pendingNotices).toEqual([])
  })

  it("keeps a caller's duration", () => {
    notify({ tone: "info", title: "A", durationMs: 1234 })
    expect(state().notice?.durationMs).toBe(1234)
  })

  it("queues a second notice behind the one on screen, and shows them in order", () => {
    const first = notify({ tone: "success", title: "Çıxış yadda saxlanıldı" })
    const second = notify({ tone: "warning", title: "Sinxronizasiya ziddiyyəti" })
    expect(titles()).toEqual(["Çıxış yadda saxlanıldı", "Sinxronizasiya ziddiyyəti"])

    dismissNotice(first)
    expect(state().notice?.id).toBe(second)
    expect(state().pendingNotices).toEqual([])

    dismissNotice(second)
    expect(state().notice).toBeNull()
  })

  it("does not repeat the same text that is already showing or waiting", () => {
    const first = notify({ tone: "warning", title: "Conflict", message: "Open Sync Center" })
    notify({ tone: "info", title: "Photo queued" })
    expect(notify({ tone: "warning", title: "Conflict", message: "Open Sync Center" })).toBe(first)
    expect(notify({ tone: "info", title: "Photo queued" })).toBe(state().pendingNotices[0].id)
    expect(titles()).toEqual(["Conflict", "Photo queued"])
    // Same title in another tone is a different notice.
    notify({ tone: "error", title: "Conflict", message: "Open Sync Center" })
    expect(titles()).toEqual(["Conflict", "Photo queued", "Conflict"])
  })

  it("keeps only the newest waiting notices in a burst", () => {
    notify({ tone: "info", title: "on screen" })
    for (let i = 1; i <= NOTICE_QUEUE_LIMIT + 2; i++) notify({ tone: "info", title: `waiting ${i}` })
    expect(state().notice?.title).toBe("on screen")
    expect(state().pendingNotices.map((notice) => notice.title)).toEqual(
      Array.from({ length: NOTICE_QUEUE_LIMIT }, (_, i) => `waiting ${i + 3}`),
    )
  })

  it("ignores a dismissal of a notice that is already gone", () => {
    const first = notify({ tone: "info", title: "first" })
    const second = notify({ tone: "info", title: "second" })
    dismissNotice(first)
    dismissNotice(first)
    expect(state().notice?.id).toBe(second)
  })

  it("can drop a waiting notice before it shows", () => {
    notify({ tone: "info", title: "first" })
    const second = notify({ tone: "info", title: "second" })
    dismissNotice(second)
    expect(titles()).toEqual(["first"])
  })
})

describe("notice timing", () => {
  it("grows with the text and stays within bounds", () => {
    expect(noticeDurationMs("OK")).toBe(NOTICE_DURATION_MS.min)
    expect(noticeDurationMs("x".repeat(500))).toBe(NOTICE_DURATION_MS.max)
    const short = noticeDurationMs("Giriş yadda saxlanıldı")
    const long = noticeDurationMs("Giriş yadda saxlanıldı", "Növbəti addım: foto çəkin və imza alın.")
    expect(long).toBeGreaterThan(short)
  })

  it("starts a notice's clock once, whichever layer draws it first", () => {
    const first = notify({ tone: "error", title: "İş günü başlamadı" })
    expect(state().noticeShownAt).toBeNull()
    // The root layer draws it; a sheet opened 3.5 s later reads the same time.
    expect(markNoticeShown(first, 5000)).toBe(5000)
    expect(markNoticeShown(first, 8500)).toBe(5000)
    expect(state().noticeShownAt).toBe(5000)
    expect(noticeRemainingMs({ shownAt: 5000, now: 8500, durationMs: 4000, hasSuccessor: false })).toBe(500)
  })

  it("gives the next notice a clock of its own and ignores a notice not on screen", () => {
    const first = notify({ tone: "success", title: "first" })
    const second = notify({ tone: "success", title: "second" })
    markNoticeShown(first, 5000)
    expect(markNoticeShown(second, 6000)).toBeNull()
    expect(state().noticeShownAt).toBe(5000)
    dismissNotice(first)
    expect(state().noticeShownAt).toBeNull()
    expect(markNoticeShown(second, 9000)).toBe(9000)
    dismissNotice(second)
    notify({ tone: "info", title: "third" })
    expect(state().noticeShownAt).toBeNull()
  })

  it("stops the clock of a notice while a choice covers it", () => {
    const id = notify({ tone: "warning", title: "Sinxronizasiya ziddiyyəti" })
    markNoticeShown(id, 5000)
    void ask({ title: "choose", buttons: [{ text: "OK", value: true }], dismissValue: false })
    expect(state().noticeShownAt).toBeNull()
    dismissChoice(state().choice!.id)
    // Its reading time starts again when a layer draws it after the choice.
    expect(markNoticeShown(id, 20000)).toBe(20000)
  })

  it("keeps the full time alone and yields early to a waiting notice", () => {
    expect(noticeRemainingMs({ shownAt: 1000, now: 2000, durationMs: 5000, hasSuccessor: false })).toBe(4000)
    expect(noticeRemainingMs({ shownAt: 1000, now: 2000, durationMs: 5000, hasSuccessor: true })).toBe(NOTICE_MIN_VISIBLE_MS - 1000)
    expect(noticeRemainingMs({ shownAt: 1000, now: 9000, durationMs: 5000, hasSuccessor: true })).toBe(0)
    expect(noticeRemainingMs({ shownAt: 1000, now: 1000, durationMs: 1000, hasSuccessor: true })).toBe(1000)
  })
})

describe("ask", () => {
  it("shows the choice without its values and resolves with the pressed button's value", async () => {
    const answer = ask({
      title: "Uzaqdasınız",
      message: "900 m",
      tone: "warning",
      buttons: [
        { text: "Ləğv et", value: false, style: "cancel" },
        { text: "Yenə də başla", value: true },
      ],
      dismissValue: false,
    })
    const choice = state().choice!
    expect(choice.title).toBe("Uzaqdasınız")
    expect(choice.tone).toBe("warning")
    expect(choice.buttons).toEqual([
      { text: "Ləğv et", style: "cancel" },
      { text: "Yenə də başla", style: "default" },
    ])
    answerChoice(choice.id, 1)
    await expect(answer).resolves.toBe(true)
    expect(state().choice).toBeNull()
  })

  it("resolves with dismissValue when the sheet is closed without a button", async () => {
    const answer = ask({
      title: "Retry?",
      buttons: [{ text: "Retry", value: "retry" }],
      dismissValue: "closed",
    })
    dismissChoice(state().choice!.id)
    await expect(answer).resolves.toBe("closed")
  })

  it("answers an index outside the buttons as a dismissal", async () => {
    const answer = ask({ title: "T", buttons: [{ text: "OK", value: 1 }], dismissValue: 0 })
    answerChoice(state().choice!.id, 5)
    await expect(answer).resolves.toBe(0)
  })

  it("queues a second ask behind the open one and answers both in order", async () => {
    const order: string[] = []
    const first = ask({ title: "first", buttons: [{ text: "A", value: "a" }], dismissValue: "x" })
      .then((value) => { order.push(`first:${value}`); return value })
    const second = ask({ title: "second", buttons: [{ text: "B", value: "b" }, { text: "C", value: "c" }], dismissValue: "y" })
      .then((value) => { order.push(`second:${value}`); return value })

    expect(state().choice?.title).toBe("first")
    expect(state().pendingChoices.map((choice) => choice.title)).toEqual(["second"])

    const firstId = state().choice!.id
    answerChoice(firstId, 0)
    expect(state().choice?.title).toBe("second")
    expect(state().pendingChoices).toEqual([])

    // A late second tap on the first sheet must not answer the one now open.
    answerChoice(firstId, 0)
    dismissChoice(firstId)
    expect(state().choice?.title).toBe("second")

    clock += CHOICE_SWAP_GUARD_MS
    answerChoice(state().choice!.id, 1)
    await expect(first).resolves.toBe("a")
    await expect(second).resolves.toBe("c")
    expect(order).toEqual(["first:a", "second:c"])
    expect(state().choice).toBeNull()
  })

  it("does not let the second tap of a double tap answer the choice that took the sheet", async () => {
    // VisitScreen: «Open settings» for a refused permission, then the queued
    // out-of-zone question whose red «Check in anyway» sits in the same place.
    void ask({ title: "Settings", buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Open settings", value: true }], dismissValue: false })
    const forced = ask({
      title: "Too far",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Check in anyway", value: true, style: "destructive" }],
      dismissValue: false,
    })
    answerChoice(state().choice!.id, 1)
    const tooFar = state().choice!
    expect(tooFar.title).toBe("Too far")

    clock += 120
    answerChoice(tooFar.id, 1)
    dismissChoice(tooFar.id)
    expect(state().choice?.id).toBe(tooFar.id)

    // Read and pressed after the moment: answered as usual.
    clock += CHOICE_SWAP_GUARD_MS
    answerChoice(tooFar.id, 0)
    await expect(forced).resolves.toBe(false)
    expect(state().choice).toBeNull()
  })

  it("guards a choice raised right after an answer, and not one raised later", async () => {
    const first = ask({ title: "first", buttons: [{ text: "A", value: "a" }], dismissValue: "x" })
    answerChoice(state().choice!.id, 0)
    await expect(first).resolves.toBe("a")

    // The sheet closed and reopened at once for the next question.
    clock += 100
    const soon = ask({ title: "soon", buttons: [{ text: "B", value: "b" }], dismissValue: "y" })
    const soonId = state().choice!.id
    answerChoice(soonId, 0)
    expect(state().choice?.id).toBe(soonId)
    clock += CHOICE_SWAP_GUARD_MS
    answerChoice(soonId, 0)
    await expect(soon).resolves.toBe("b")

    clock += 1000
    const later = ask({ title: "later", buttons: [{ text: "C", value: "c" }], dismissValue: "z" })
    answerChoice(state().choice!.id, 0)
    await expect(later).resolves.toBe("c")
  })

  it("still closes a guarded choice when the session ends", async () => {
    void ask({ title: "first", buttons: [{ text: "A", value: 1 }], dismissValue: 0 })
    const second = ask({ title: "second", buttons: [{ text: "B", value: 2 }], dismissValue: 0 })
    answerChoice(state().choice!.id, 0)
    dismissAllChoices()
    await expect(second).resolves.toBe(0)
    expect(state().choice).toBeNull()
  })

  it("cannot answer a waiting choice before it is shown", async () => {
    const first = ask({ title: "first", buttons: [{ text: "A", value: 1 }], dismissValue: 0 })
    void ask({ title: "second", buttons: [{ text: "B", value: 2 }], dismissValue: 0 })
    const waitingId = state().pendingChoices[0].id
    answerChoice(waitingId, 0)
    dismissChoice(waitingId)
    expect(state().choice?.title).toBe("first")
    expect(state().pendingChoices.map((choice) => choice.id)).toEqual([waitingId])
    answerChoice(state().choice!.id, 0)
    await expect(first).resolves.toBe(1)
  })

  it("refuses no buttons and more than Android's three", async () => {
    await expect(ask({ title: "none", buttons: [], dismissValue: null })).rejects.toThrow("1 to 3 buttons")
    const four = [1, 2, 3, 4].map((value) => ({ text: String(value), value }))
    expect(four.length).toBeGreaterThan(APP_CHOICE_MAX_BUTTONS)
    await expect(ask({ title: "four", buttons: four, dismissValue: 0 })).rejects.toThrow("got 4")
    expect(state().choice).toBeNull()
  })

  it("leaves no caller suspended on reset: open and waiting asks resolve with their dismissValue", async () => {
    const open = ask({ title: "open", buttons: [{ text: "A", value: "a" }], dismissValue: "open-dismissed" })
    const waiting = ask({ title: "waiting", buttons: [{ text: "B", value: "b" }], dismissValue: "waiting-dismissed" })
    notify({ tone: "info", title: "notice" })
    resetAppFeedback()
    await expect(open).resolves.toBe("open-dismissed")
    await expect(waiting).resolves.toBe("waiting-dismissed")
    expect(state()).toEqual({ notice: null, noticeShownAt: null, pendingNotices: [], choice: null, pendingChoices: [] })
  })

  it("closes every choice when the session ends, and keeps the notice that may explain why", async () => {
    const open = ask({ title: "Uzaqdasınız", buttons: [{ text: "Yenə də başla", value: true }], dismissValue: false })
    const waiting = ask({ title: "İmza lazımdır", buttons: [{ text: "İndi imzala", value: "sign" }], dismissValue: "later" })
    notify({ tone: "error", title: "Sessiya bitdi" })
    dismissAllChoices()
    await expect(open).resolves.toBe(false)
    await expect(waiting).resolves.toBe("later")
    expect(state().choice).toBeNull()
    expect(state().pendingChoices).toEqual([])
    expect(state().notice?.title).toBe("Sessiya bitdi")
  })

  it("keeps notices and choices apart", async () => {
    notify({ tone: "success", title: "saved" })
    const answer = ask({ title: "choose", buttons: [{ text: "OK", value: true }], dismissValue: false })
    expect(state().notice?.title).toBe("saved")
    expect(state().choice?.title).toBe("choose")
    dismissChoice(state().choice!.id)
    await expect(answer).resolves.toBe(false)
    expect(state().notice?.title).toBe("saved")
  })
})
