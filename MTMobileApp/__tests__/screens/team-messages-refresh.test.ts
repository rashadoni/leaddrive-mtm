import fs from "node:fs"
import path from "node:path"

function readSource(relative: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../src", relative), "utf8")
}

describe("team messages delivery refresh", () => {
  it("refreshes a focused inbox on a bounded interval and after foreground resume", () => {
    const screen = readSource("screens/more/TeamMessagesScreen.tsx")
    const hook = readSource("hooks/useAutoRefresh.ts")

    expect(screen).toContain('import { useAutoRefresh } from "../../hooks/useAutoRefresh"')
    expect(screen).toContain("const TEAM_MESSAGES_REFRESH_INTERVAL_MS = 30_000")
    expect(screen).toContain("useAutoRefresh(")
    expect(screen).toContain("TEAM_MESSAGES_REFRESH_INTERVAL_MS)")
    expect(screen).not.toContain("useFocusEffect")

    expect(hook).toContain("setInterval(() => refreshRef.current(), intervalMs)")
    expect(hook).toContain('if (state === "active") refreshRef.current()')
    expect(hook).toContain("clearInterval(interval)")
    expect(hook).toContain("sub.remove()")
  })

  it("shows only the unread count returned by the server", () => {
    const screen = readSource("screens/more/TeamMessagesScreen.tsx")

    expect(screen).toContain("Number.isInteger(response.data?.unread)")
    expect(screen).toContain("setUnreadCount")
    expect(screen).toContain("copy.unreadCount(unreadCount)")
    expect(screen).not.toContain("threads.filter((thread) => thread.unread)")
  })
})
