import fs from "fs"
import path from "path"

const viewer = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/visit/PresentationViewerScreen.tsx"),
  "utf8",
)
const workspace = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/visit/VisitWorkspaceScreen.tsx"),
  "utf8",
)

describe("presentation evidence in a visit", () => {
  it("starts an evidence session, periodically saves activity and closes it on exit", () => {
    expect(viewer).toContain("startPresentationSession")
    expect(viewer).toContain("savePresentationSession")
    expect(viewer).toContain("closedAt: closedAt.toISOString()")
    expect(viewer).toContain("activeDurationSeconds")
    expect(viewer).toContain("currentPosition")
    expect(viewer).toContain("if (cancelled)")
  })

  it("opens only from a concrete visit workspace", () => {
    expect(workspace).toContain('navigation.navigate("PresentationViewer", { visitId: data.id, product })')
    expect(workspace).toContain("data.presentationSessions")
  })

  it("truthfully describes an opened file instead of claiming the client saw it", () => {
    expect(viewer).toContain("Открытие файла записывается в журнал визита")
    expect(viewer).toContain("не доказывает, что клиент его видел")
    expect(viewer).not.toContain("клиент посмотрел")
    expect(viewer).not.toContain("показано клиенту")
  })
})
