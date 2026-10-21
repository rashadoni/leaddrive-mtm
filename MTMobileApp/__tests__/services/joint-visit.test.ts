import AsyncStorage from "@react-native-async-storage/async-storage"
import type { TFunction } from "i18next"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { setOfflineScope } from "../../src/services/offline-scope"
import {
  DEFAULT_EVALUATION_QUESTIONS,
  EVALUATION_CRITERIA,
  JOINT_ANSWER_ALONE,
  cachedJointManagers,
  currentJointVisit,
  formatScore,
  jointCheckInButtons,
  jointManagersForCheckIn,
  jointVisitFailure,
  personInitials,
  questionLabel,
  readQuestions,
  readScores,
  refreshJointManagers,
  scoresAverage,
  toJointManagers,
  toJointVisitState,
  unratedJointVisits,
  visitSubtitle,
  visitTitle,
} from "../../src/services/joint-visit"
import { queueVisitCheckIn } from "../../src/services/visit-outbox"

/**
 * Joint visit (owner, 2026-10-20; mockup approved with «Давай, агент оценку
 * не видит»): the manager's session with one agent, the agent's answer at
 * check-in, the manager's rating. Fictional people.
 */

const SERVER_STATE = {
  success: true,
  data: {
    session: { id: "session-1", startedAt: "2026-10-20T05:05:00.000Z", agent: { id: "agent-elvin", name: "Fictional Elvin" } },
    visits: [
      {
        id: "visit-1",
        status: "CHECKED_OUT",
        checkInAt: "2026-10-20T05:20:00.000Z",
        checkOutAt: "2026-10-20T05:48:00.000Z",
        agent: { id: "agent-elvin", name: "Fictional Elvin" },
        customer: { id: "c1", name: "Fictional Pharmacy" },
        contact: null,
        joint: true,
        canEvaluate: true,
        evaluateUntil: "2026-10-21T20:00:00.000Z",
        evaluation: { scores: { PREPARATION: 4, RAPPORT: 5, CHARM: 5, NEEDS: 9 }, comment: "  Good  ", updatedAt: "2026-10-20T05:50:00.000Z" },
      },
      {
        id: "visit-2",
        status: "CHECKED_IN",
        checkInAt: "2026-10-20T06:42:00.000Z",
        checkOutAt: null,
        agent: { id: "agent-elvin", name: "Fictional Elvin" },
        customer: { id: "c2", name: "Fictional Clinic" },
        contact: { id: "d1", displayName: "Dr. Fictional", specialtyName: "Cardiologist" },
        joint: true,
        canEvaluate: true,
        evaluateUntil: "2026-10-21T20:00:00.000Z",
        evaluation: null,
      },
      { id: "", checkInAt: "2026-10-20T06:00:00.000Z" },
    ],
  },
}

describe("what the manager's phone reads of a joint visit", () => {
  it("keeps the session, the visits and only the known 1..5 points", () => {
    const state = toJointVisitState(SERVER_STATE)
    expect(state.session).toEqual({ id: "session-1", startedAt: "2026-10-20T05:05:00.000Z", agent: { id: "agent-elvin", name: "Fictional Elvin" } })
    expect(state.visits.map((visit) => visit.id)).toEqual(["visit-1", "visit-2"])
    expect(state.visits[0].evaluation).toEqual({
      questions: DEFAULT_EVALUATION_QUESTIONS,
      scores: { PREPARATION: 4, RAPPORT: 5 },
      average: 4.5,
      comment: "Good",
      updatedAt: "2026-10-20T05:50:00.000Z",
    })
    // A server from before the company lists sends no questions: the sheet asks the six.
    expect(state.questions).toEqual(DEFAULT_EVALUATION_QUESTIONS)
    expect(currentJointVisit(state)?.id).toBe("visit-2")
    expect(unratedJointVisits(state).map((visit) => visit.id)).toEqual(["visit-2"])
  })

  it("names the doctor first and the institution under it", () => {
    const state = toJointVisitState(SERVER_STATE)
    expect(visitTitle(state.visits[1])).toBe("Dr. Fictional")
    expect(visitSubtitle(state.visits[1])).toBe("Cardiologist · Fictional Clinic")
    expect(visitTitle(state.visits[0])).toBe("Fictional Pharmacy")
    expect(visitSubtitle(state.visits[0])).toBe("")
  })

  it("reads an empty or broken answer as no session and no visits", () => {
    expect(toJointVisitState(null)).toEqual({ session: null, visits: [], questions: DEFAULT_EVALUATION_QUESTIONS })
    expect(toJointVisitState({ data: { session: { id: "s" }, visits: "x" } })).toEqual({ session: null, visits: [], questions: DEFAULT_EVALUATION_QUESTIONS })
  })
})

describe("the company's own questions (owner, 2026-10-21)", () => {
  const SAMPLES = { id: "q-samples", labels: { az: "Nümunələrlə iş", ru: "Работа с образцами", en: "Working with samples" } }
  const RENAMED = { id: "PREPARATION", labels: { az: "Hazırlıq", ru: "Подготовка и материалы", en: "Preparation" } }
  const t = ((key: string) => `t:${key}`) as unknown as TFunction

  it("asks the company's list of today, in its order", () => {
    const state = toJointVisitState({ data: { ...SERVER_STATE.data, questions: [RENAMED, SAMPLES, { id: "", labels: { ru: "x" } }, { id: "q-empty", labels: {} }] } })
    expect(state.questions).toEqual([RENAMED, SAMPLES])
  })

  it("reads a rating by the list it was given against, not by today's", () => {
    const visit = {
      ...SERVER_STATE.data.visits[0],
      evaluation: { scores: { "q-samples": 4, PREPARATION: 5, OBJECTIONS: 3 }, questions: [RENAMED, SAMPLES], comment: null, updatedAt: "2026-10-20T05:50:00.000Z" },
    }
    const state = toJointVisitState({ data: { session: null, visits: [visit], questions: [SAMPLES] } })
    expect(state.visits[0].evaluation).toMatchObject({ questions: [RENAMED, SAMPLES], scores: { "q-samples": 4, PREPARATION: 5 }, average: 4.5 })
  })

  it("fills a language the office left empty from one it wrote", () => {
    expect(readQuestions([{ id: "q-1", labels: { ru: "Образцы", az: "", en: "" } }])).toEqual([{ id: "q-1", labels: { az: "Образцы", ru: "Образцы", en: "Образцы" } }])
    expect(readQuestions("nope")).toBeNull()
    expect(readQuestions([])).toBeNull()
  })

  it("names a question in the phone's language, and one of the six in the app's own words", () => {
    expect(questionLabel(SAMPLES, "az", t)).toBe("Nümunələrlə iş")
    expect(questionLabel(SAMPLES, "en", t)).toBe("Working with samples")
    expect(questionLabel(SAMPLES, "ru", t)).toBe("Работа с образцами")
    expect(questionLabel({ id: "NEEDS", labels: null }, "ru", t)).toBe("t:jointVisit.criteria.NEEDS")
  })

  it("scores only the questions of the list it is read against", () => {
    expect(readScores({ "q-samples": 4, CHARM: 5, PREPARATION: 6 }, [SAMPLES, RENAMED])).toEqual({ "q-samples": 4 })
  })
})

describe("the rating", () => {
  it("rates six points in the agreed order", () => {
    expect(EVALUATION_CRITERIA).toEqual(["PREPARATION", "RAPPORT", "NEEDS", "PRESENTATION", "OBJECTIONS", "CLOSING"])
  })

  it("averages only the rated points, to one decimal", () => {
    expect(scoresAverage({})).toBeNull()
    expect(scoresAverage({ PREPARATION: 4, RAPPORT: 5, NEEDS: 3, PRESENTATION: 4, CLOSING: 5 })).toBe(4.2)
    expect(scoresAverage(readScores({ OBJECTIONS: 0, CLOSING: 2.5, NEEDS: 3 }))).toBe(3)
  })

  it("writes the score with a comma in Russian and Azerbaijani, a dot in English", () => {
    expect(formatScore(4.2, "ru")).toBe("4,2")
    expect(formatScore(4.2, "az")).toBe("4,2")
    expect(formatScore(4.2, "en")).toBe("4.2")
    expect(formatScore(5, "ru")).toBe("5")
  })

  it("names what went wrong in the screens' words", () => {
    const coded = (code: string) => Object.assign(new Error("refused"), { code })
    expect(jointVisitFailure(coded("MTM_JOINT_VISIT_AGENT_FORBIDDEN"))).toBe("notInTeam")
    expect(jointVisitFailure(coded("MTM_VISIT_EVALUATION_NOT_JOINT"))).toBe("notJoint")
    expect(jointVisitFailure(coded("MTM_VISIT_EVALUATION_CLOSED"))).toBe("closed")
    expect(jointVisitFailure(coded("MTM_VISIT_EVALUATION_QUESTIONS_CHANGED"))).toBe("questionsChanged")
    expect(jointVisitFailure(new Error("Network request failed"))).toBe("offline")
    expect(jointVisitFailure(new Error("SESSION_EXPIRED"))).toBe("session")
    expect(jointVisitFailure(new Error("boom"))).toBe("failed")
  })

  it("makes initials without upper-casing by the phone's locale", () => {
    expect(personInitials("Elvin Həsənov")).toBe("EH")
    expect(personInitials("İlkin")).toBe("İL")
  })
})

describe("the agent's question at check-in", () => {
  const t = ((key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key)) as unknown as TFunction

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-20T09:15:00.000Z"))
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-elvin")
  })
  afterEach(() => jest.useRealTimers())

  it("offers «no» outlined first and «yes» as the one filled answer last", () => {
    expect(jointCheckInButtons([{ id: "manager-1", name: "Fictional Narmin" }], t)).toEqual([
      { text: "jointVisit.askAlone", value: JOINT_ANSWER_ALONE },
      { text: "jointVisit.askYes", value: "manager-1" },
    ])
  })

  it("names each manager when two are in the field with the agent, three buttons at most", () => {
    const buttons = jointCheckInButtons([
      { id: "m1", name: "Fictional A" },
      { id: "m2", name: "Fictional B" },
      { id: "m3", name: "Fictional C" },
    ], t)
    expect(buttons.map((button) => button.value)).toEqual([JOINT_ANSWER_ALONE, "m1", "m2"])
    expect(buttons[1].text).toBe('jointVisit.askYesNamed {"name":"Fictional A"}')
  })

  it("asks the server, keeps the answer for the day, and uses it offline", async () => {
    const online = await jointManagersForCheckIn(async () => ({ data: { managers: [{ id: "m1", name: "Fictional Narmin", startedAt: "x" }] } }))
    expect(online).toEqual([{ id: "m1", name: "Fictional Narmin" }])

    const offline = await jointManagersForCheckIn(async () => { throw new Error("Network request failed") })
    expect(offline).toEqual([{ id: "m1", name: "Fictional Narmin" }])

    // Tomorrow yesterday's manager is nobody's.
    jest.setSystemTime(new Date("2026-10-21T09:15:00.000Z"))
    expect(await cachedJointManagers()).toEqual([])
  })

  it("does not wait for a slow server longer than its short while", async () => {
    await refreshJointManagers(async () => ({ data: { managers: [{ id: "m1", name: "Fictional Narmin" }] } }))
    const pending = jointManagersForCheckIn(() => new Promise(() => {}), new Date(), 2_500)
    jest.advanceTimersByTime(2_500)
    expect(await pending).toEqual([{ id: "m1", name: "Fictional Narmin" }])
  })

  it("an empty answer from the server forgets the manager who ended the visit", async () => {
    await refreshJointManagers(async () => ({ data: { managers: [{ id: "m1", name: "Fictional Narmin" }] } }))
    await refreshJointManagers(async () => ({ data: { managers: [] } }))
    expect(await cachedJointManagers()).toEqual([])
    expect(toJointManagers({ data: { managers: [{ id: "m1" }, { name: "x" }] } })).toEqual([])
  })

  it("sends the agent's «yes» with the check-in", async () => {
    const { operation } = await queueVisitCheckIn({
      customer: { id: "customer-1", name: "Fictional Clinic" },
      routeId: "route-1",
      routePointId: "point-1",
      jointManagerId: "manager-1",
    })
    expect(operation.data).toMatchObject({ customerId: "customer-1", status: "CHECKED_IN", jointManagerId: "manager-1" })

    const { operation: alone } = await queueVisitCheckIn({ customer: { id: "customer-2", name: "Fictional Pharmacy" } })
    expect(alone.data).not.toHaveProperty("jointManagerId")
  })
})
