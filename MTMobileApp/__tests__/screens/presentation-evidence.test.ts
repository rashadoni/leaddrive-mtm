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
    expect(viewer).toContain("closeRequested.current")
    expect(viewer).toContain("pagesViewed.current")
    expect(viewer).toContain("pageEvents.current")
    expect(viewer).toContain("lastPage.current")
  })

  it("records a PDF only after a rendered page is actually displayed", () => {
    expect(viewer).toContain("<Image")
    expect(viewer).toContain("onLoad={() => markPageDisplayed")
    expect(viewer).toContain("ensureEvidenceSession(knownPageCount)")
    expect(viewer).not.toContain("<WebView")
    expect(viewer).not.toContain("pagesViewed: []")
  })

  it("opens only from a concrete visit workspace", () => {
    expect(workspace).toContain('navigation.navigate("PresentationViewer", { visitId: data.id, product })')
    expect(workspace).toContain("data.presentationSessions")
  })

  it("truthfully describes an opened file instead of claiming the client saw it", () => {
    expect(viewer).toContain("Показ файла записывается в журнал визита")
    expect(viewer).toContain("не доказывает, что клиент их видел")
    expect(viewer).not.toContain("клиент посмотрел")
    expect(viewer).not.toContain("показано клиенту")
  })

  it("does not treat a PowerPoint handoff as verified in-app evidence", () => {
    expect(viewer).toContain("такой запуск не отмечает презентацию выполненной")
    expect(viewer).toContain("openExternalPresentation")
  })
})
