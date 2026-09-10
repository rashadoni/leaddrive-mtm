import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B10 and defect M-20: the task card taught
 * instead of showing.
 *
 * The screen titled itself "Понятный порядок выполнения" above the one line an
 * agent opened it for — the task's name. Each section began with an
 * instruction on how to read it, and a finished task got the same coaching as
 * an unopened one. Priority was written as advice ("Высокая · не
 * откладывайте"), and the three status filters were numbered "1 · 2 · 3" as if
 * they were steps of one procedure rather than three views of one list.
 */
const list = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/tasks/TasksScreen.tsx"),
  "utf8",
)
const detail = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/tasks/TaskDetailScreen.tsx"),
  "utf8",
)

describe("B10: tasks state facts, not advice", () => {
  it("does not number three independent filters as steps", () => {
    for (const marker of ["1 · ", "2 · ", "3 · "]) {
      expect(list).not.toContain(marker)
    }
    expect(list).toContain('status: { PENDING: "К выполнению"')
    expect(list).toContain('status: { PENDING: "Görüləcək"')
    expect(list).toContain('status: { PENDING: "To do"')
  })

  it("states the priority instead of counselling about it", () => {
    // "Высокая" is something the screen knows. "не откладывайте" is not.
    expect(list).toContain('priority: Record<TaskPriority, string>')
    expect(list).not.toContain("не откладывайте")
    expect(list).not.toContain("təxirə salmayın")
    expect(list).not.toContain("do not put this off")
    expect(list).toContain("{priorityCopy}")
  })

  it("names the task where the screen title belongs", () => {
    expect(detail).not.toContain("copy.guide")
    expect(detail).not.toContain("Понятный порядок выполнения")
    expect(detail).toContain("{task.title}")
  })

  it("drops the instructions that a finished task got too", () => {
    for (const removed of ["requirementHint", "contextHint", "progressHint"]) {
      expect(detail).not.toContain(removed)
    }
    // The evidence section keeps its line: it describes contents you cannot
    // predict from the heading, which is a fact, not coaching.
    expect(detail).toContain("hint={copy.evidenceHint}")
  })

  it("lets a section stand without a subtitle", () => {
    // Three of the four now pass no hint at all.
    expect(detail).toContain("hint?: string")
    expect(detail).toContain("{hint ? <Text style={styles.cardHint}>{hint}</Text> : null}")
  })
})
