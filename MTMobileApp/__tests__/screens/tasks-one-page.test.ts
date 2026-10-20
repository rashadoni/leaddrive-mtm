import fs from "fs"
import path from "path"

/**
 * Found by the owner on a Redmi Pad SE held in landscape (2026-09-14): the
 * header, focus strip and tabs stayed put while fifty tasks scrolled in a
 * 522 px box, beside a 518 px box of details with its own scroll. "There must
 * be no inner scroll: this is not Windows or a browser."
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/tasks/TasksScreen.tsx"), "utf8")

describe("Tasks is one scrolling page", () => {
  it("puts the header, notices and filter inside the list", () => {
    expect(source).toContain("ListHeaderComponent={listHeader}")
    expect(source.match(/<FlatList\b/g)).toHaveLength(1)
    expect(source).not.toContain("<ScrollView")
  })

  it("has no side pane scrolling beside the list", () => {
    expect(["TaskDetailPanel", "detailPane", "tabletWorkspace", "focusedTaskId"].filter((name) => source.includes(name))).toEqual([])
    expect(source).toContain("onPress={() => openTask(item)}")
  })

  it("is one column of rows on the phone and on the tablet, like the boards' list", () => {
    // Owner, 2026-10-20: «бери из досок». Group headers run across the list,
    // so the two-column tablet grid of cards is gone.
    expect(source).not.toContain("numColumns")
    expect(source).toContain('listCell: { width: "100%", maxWidth: 1280, alignSelf: "center"')
  })

  it("does not let the top of the page collapse", () => {
    const bodyTop = source.slice(source.indexOf("\n  bodyTop: {"), source.indexOf("},", source.indexOf("\n  bodyTop: {")))
    expect(bodyTop).not.toContain("flex: 1")
  })

  it("says, when the list is empty, what is empty for the chosen filter", () => {
    expect(source).not.toContain("recommendedTab")
    expect(source).toContain("<EmptyState copy={copy} filter={filter}")
  })
})
