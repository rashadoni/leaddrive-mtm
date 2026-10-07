import fs from "fs"
import path from "path"
import {
  selfPlanLeavesAfterPublishedEdit,
  selfPlanLeavesAfterSave,
  selfPlanSaveOutcome,
  selfPlannerNextStep,
} from "../../src/screens/planning/self-plan-outcome"

/**
 * Tablet in the field, 2026-10-06. An agent whose routes a manager approves
 * built today's route and saved it. The planner said «Marşrut yadda
 * saxlanıldı», its only button went grey, and the Route tab still read «no
 * route today»: the route was a draft waiting for the manager, and nothing
 * told the agent so. The owner: «нет следующего шага».
 */
const core = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("self planner: what a save amounted to", () => {
  it("says the route went to the manager when the agent may not publish", () => {
    // What the server recorded that day: one draft, one stop, never published.
    expect(selfPlanSaveOutcome({ mode: "draft", savedStopCounts: [1], published: 0 })).toBe("sent-for-approval")
    // A week saved in one go, some days empty: there is still a route to approve.
    expect(selfPlanSaveOutcome({ mode: "draft", savedStopCounts: [0, 3, 0], published: 0 })).toBe("sent-for-approval")
  })

  it("says the route is live only when the server published it", () => {
    expect(selfPlanSaveOutcome({ mode: "publish", savedStopCounts: [2], published: 1 })).toBe("published")
    // Drafts written earlier and published now, with nothing new to write.
    expect(selfPlanSaveOutcome({ mode: "publish", savedStopCounts: [], published: 2 })).toBe("published")
  })

  it("promises nobody anything when the agent emptied the day", () => {
    expect(selfPlanSaveOutcome({ mode: "draft", savedStopCounts: [0], published: 0 })).toBe("saved")
    expect(selfPlanSaveOutcome({ mode: "publish", savedStopCounts: [0], published: 0 })).toBe("saved")
    expect(selfPlanSaveOutcome({ mode: "draft", savedStopCounts: [], published: 0 })).toBe("saved")
  })
})

describe("self planner: where the agent is after a save", () => {
  it("goes back to the screen he came from once the route is live or with the manager", () => {
    expect((["published", "sent-for-approval"] as const).map((outcome) => selfPlanLeavesAfterSave({ outcome, canClose: true })))
      .toEqual([true, true])
  })

  it("stays when he emptied the day: nothing went anywhere, and he is about to pick other stops", () => {
    expect(selfPlanLeavesAfterSave({ outcome: "saved", canClose: true })).toBe(false)
  })

  it("stays where there is nothing to go back to", () => {
    expect((["published", "sent-for-approval", "saved"] as const).filter((outcome) => selfPlanLeavesAfterSave({ outcome, canClose: false })))
      .toEqual([])
  })

  it("says what happened over the next screen, skips the refresh of a planner that is closing, and closes last", () => {
    const save = core.slice(core.indexOf("const save = async () => {"), core.indexOf("const confirmAndSave = async () => {"))
    expect(save).toContain('notify({ tone: "success", title: selfSaveTitle, message: selfSaveBody })')
    expect(save).toContain("if (!leaveAfterSave) {\n          await loadPlan(operationAgentId, operationDates, true)")
    // After `finally`: the saving flag is down before the screen goes away.
    expect(save.trimEnd().endsWith("savingRef.current = false\n    }\n    if (leaveAfterSave) onClose?.()\n  }")).toBe(true)
    // A partial or failed save never leaves: only the success branch sets it.
    expect((save.match(/leaveAfterSave = true/g) ?? []).length).toBe(1)
  })
})

describe("self planner: the button after a save", () => {
  const afterSave = { savedShown: true, canSave: false, saving: false, canClose: true }

  it("leads out of the planner instead of standing disabled", () => {
    expect(selfPlannerNextStep(afterSave)).toBe("done")
  })

  it("saves again as soon as there is something to save", () => {
    // Any change clears the result on screen and makes the plan saveable.
    expect(selfPlannerNextStep({ ...afterSave, savedShown: false, canSave: true })).toBe("save")
    expect(selfPlannerNextStep({ ...afterSave, canSave: true })).toBe("save")
  })

  it("does not offer a way out before anything was saved, or while saving", () => {
    expect(selfPlannerNextStep({ ...afterSave, savedShown: false })).toBe("save")
    expect(selfPlannerNextStep({ ...afterSave, saving: true })).toBe("save")
  })

  it("does not offer «done» where the planner has nowhere to go back to", () => {
    expect(selfPlannerNextStep({ ...afterSave, canClose: false })).toBe("save")
  })
})

describe("self planner: the screen uses both", () => {
  it("names the outcome and explains it under the title", () => {
    expect(core).toContain("savedStopCounts: savedWrites.map((item) => item.write.points.length)")
    expect(core).toContain('const selfSaveTitle = selfOutcome !== "sent-for-approval" ? selfCopy.savedRoute : selfCopy.sentRoute')
    expect(core).toContain("title={saveMessage.text} body={saveMessage.body} />")
  })

  it("closes the planner from the dock once the save is on screen", () => {
    const footerStart = core.indexOf("const footerAction = selfPlanning")
    const footer = core.slice(footerStart, core.indexOf("return (", footerStart))
    expect(footer).toContain('selfNextStep === "done"')
    expect(footer).toContain("label: selfCopy.done")
    expect(footer).toContain("onPress: () => { onClose?.() }")
    expect(core).toContain('savedShown: saveMessage?.tone === "success"')
  })

  it("has the words in all three languages, and none of them says «draft»", () => {
    const keys = ["savedPublishedBody", "sentRoute", "sentRouteBody", "done"]
    const counts = keys.map((key) => (core.match(new RegExp(`^    ${key}: "[^"]+",$`, "gm")) ?? []).length)
    expect(counts).toEqual([3, 3, 3, 3])
    const words = keys.flatMap((key) => core.match(new RegExp(`^    ${key}: "[^"]+",$`, "gm")) ?? [])
    expect(words.filter((line) => /чернов|qaralama|draft/i.test(line))).toEqual([])
  })
})

/**
 * 7 October 2026, owner's phone. «Planı dəyiş» on the Route tab, one client
 * added to today's published route, the change sent. The server took it at
 * once. The planner stayed: the day's clients greyed out, «Saxlanacaq qaralama
 * yoxdur» under them and a disabled «Marşrutu yadda saxla» — «нажал изменить
 * маршрут, добавил клиента и так осталось».
 */
describe("after a change to a published route", () => {
  it("the agent's planner goes back to where he came from", () => {
    expect(selfPlanLeavesAfterPublishedEdit({ selfPlanning: true, canClose: true })).toBe(true)
  })

  it("a manager's planner stays, and so does one with nowhere to go back to", () => {
    expect(selfPlanLeavesAfterPublishedEdit({ selfPlanning: false, canClose: true })).toBe(false)
    expect(selfPlanLeavesAfterPublishedEdit({ selfPlanning: true, canClose: false })).toBe(false)
  })

  const publish = core.slice(core.indexOf("const publishPublishedEdit = async"), core.indexOf("const editAction = {"))

  it("says the plan is updated, and only then closes", () => {
    const updated = publish.indexOf("await publishedEditSource.updatePublished({")
    const notice = publish.indexOf('notify({ tone: "success", title: t("managerShell.planEditUpdated")')
    const decided = publish.indexOf("if (selfPlanLeavesAfterPublishedEdit({ selfPlanning, canClose: Boolean(onClose) })) {")
    const closed = publish.indexOf("if (leaveAfterEdit) onClose?.()")
    expect([updated > -1, notice > updated, decided > notice, closed > decided]).toEqual([true, true, true, true])
  })

  it("closes after the saving state is cleared, never from inside a failed attempt", () => {
    const cleared = publish.indexOf("savingRef.current = false\n    }\n    if (leaveAfterEdit) onClose?.()")
    expect(cleared).toBeGreaterThan(-1)
    const failure = publish.slice(publish.indexOf("} catch (error: unknown) {"), publish.indexOf("} finally {"))
    expect(failure).not.toContain("leaveAfterEdit = true")
    expect(failure).not.toContain("onClose")
  })

  it("does not reload a plan nobody will look at, but still does when it stays", () => {
    const success = publish.slice(publish.indexOf("exitPublishedEdit()"), publish.indexOf("} catch (error: unknown) {"))
    expect(success).toContain("leaveAfterEdit = true\n      } else {\n        await loadPlan(operationAgentId, operationDates, true)")
  })
})
