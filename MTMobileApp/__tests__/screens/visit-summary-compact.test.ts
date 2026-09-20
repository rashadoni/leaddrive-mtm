import fs from "fs"
import path from "path"

const workspace = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/visit/VisitWorkspaceScreen.tsx"),
  "utf8",
)
const visitScreen = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"),
  "utf8",
)

/**
 * Owner on a Galaxy S23, 2026-09-20: «итог визита много пустоты, растянутый
 * как хвост» and «кнопки визита горизонтально смотрятся некрасиво, лучше
 * вертикально». The screen spent a quarter of the phone on a green
 * explanation, then four facts as four blue blocks one under another, then
 * two cards whose only content was that there was no content.
 */
describe("visit summary fits the phone", () => {
  it("keeps the client's name on one line and drops the summary's own explanation", () => {
    expect(workspace).toContain('<Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>')
    expect(workspace).toContain('visibleSection === "presentations" || visibleSection === "tasks" ? (')
    // The teaching subtitles stay where they teach.
    expect(workspace).toContain("copy.presentationSubtitle")
    expect(workspace).toContain("copy.tasksSubtitle")
  })

  it("puts the facts side by side instead of one blue block per line", () => {
    // Arrival and departure moved onto the roadmap, so the card carries two
    // facts — duration and photos — and they share a row.
    expect(workspace).toMatch(/stat: \{[^}]*flexBasis: "45%"/)
    expect(workspace).toMatch(/stat: \{[^}]*minHeight: 62/)
    expect(workspace).not.toMatch(/stat: \{[^}]*blueSoft/)
  })

  it("replaces the empty result and task cards with one muted line", () => {
    expect(workspace).toContain("const hasResult = Boolean(data?.outcome || data?.resultNotes || data?.notes)")
    expect(workspace).toContain("const hasTaskContent = (data?.tasks.length ?? 0) > 0 || taskRequirements.length > 0")
    expect(workspace).toContain('visibleSection === "summary" && hasResult ?')
    expect(workspace).toContain("{hasTaskContent ? <SectionCard")
    expect(workspace).toContain("copy.pendingLine.replace(\"{{items}}\", pendingParts.join(\", \"))")
    // The paragraphs those cards used to print are gone for good.
    expect(workspace).not.toContain("noResultBody")
    expect(workspace).not.toContain("copy.noTasks")
  })
})

describe("visit actions read as a list", () => {
  it("stacks the buttons instead of squeezing three across a phone", () => {
    expect(visitScreen).toMatch(/secondaryActionRow: \{ gap:/)
    expect(visitScreen).not.toMatch(/secondaryActionRow: \{ flexDirection: "row"/)
    expect(visitScreen).toMatch(/secondaryButtonText: \{ flex: 1/)
  })

  it("never lets a label break mid-word", () => {
    const stacked = visitScreen.match(/<Text style=\{styles\.secondaryButtonText\} numberOfLines=\{1\}>/g) ?? []
    expect(stacked.length).toBe(3)
  })
})
