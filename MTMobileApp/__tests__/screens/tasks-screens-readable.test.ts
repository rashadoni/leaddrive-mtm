import fs from "fs"
import path from "path"

/**
 * Found on the phone during the field UX device acceptance (2026-09-14), not
 * in the audit's task list: three things on «Tapşırıqlar» a test could not see.
 */
const tasks = fs.readFileSync(path.resolve(__dirname, "../../src/screens/tasks/TasksScreen.tsx"), "utf8")
const detail = fs.readFileSync(path.resolve(__dirname, "../../src/screens/tasks/TaskDetailScreen.tsx"), "utf8")

function style(source: string, name: string) {
  // Anchored to a line start: the copy objects have `    emptyTitle: {` too.
  const start = source.indexOf(`\n  ${name}: {`)
  expect(start).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf("},", start))
}

describe("Tasks screens say what they mean", () => {
  it("keeps the list header's title block from collapsing on the phone", () => {
    // A zero flex basis in a column with no height of its own is 0 px: the
    // header rendered as an empty green band.
    expect(style(tasks, "headerCopy")).not.toContain("flex: 1")
    expect(style(tasks, "headerCopy")).toContain("flexGrow: 1")
  })

  it("gives the empty-state title the full width", () => {
    expect(style(tasks, "emptyTitle")).toContain('alignSelf: "stretch"')
  })

  it("warns about sync on a task only when this task is affected", () => {
    // A rejected visit elsewhere put a red banner on a completed task.
    expect(detail).toContain('phase === "error" || taskConflict ? (')
    expect(detail).not.toContain('phase === "error" || conflicts > 0')
  })

  it("points to an indicator that exists", () => {
    // The task screen has no sync chip; «Bu gün» does.
    const bodies = detail.match(/syncErrorBody: "[^"]*"/g)
    expect(bodies).toEqual([
      'syncErrorBody: "Откройте индикатор синхронизации на экране «Сегодня», чтобы повторить или решить конфликт."',
      'syncErrorBody: "Təkrar cəhd və ya konflikti həll etmək üçün «Bu gün» ekranında sinxronizasiya göstəricisini açın."',
      'syncErrorBody: "Open the sync indicator on the Today screen to retry or resolve a conflict."',
    ])
  })

  it("does not number the action dock as a fifth step", () => {
    // Sections are numbered 1–4 in the scroll; a «5» on the always-visible dock
    // sat next to sections 1 and 2.
    expect(detail).not.toContain("<Text style={styles.nextStepNumberText}>5</Text>")
  })
})
