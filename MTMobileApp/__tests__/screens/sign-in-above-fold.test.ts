import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B20 and defect M-14: the login screen asked
 * to be scrolled before you could log in.
 *
 * Measured on the owner's phone (1080×2316) on 10 September: the first field
 * started around y=1663, that is 72 % down the screen. Above it stood a mark,
 * the product name, a welcome heading, a paragraph, and a two-step list — and
 * that list said what the two blocks under it already say: the progress row
 * gives the step, the company card gives the company and the way to change it.
 *
 * On a tablet the intro is its own column with room to spare, so it keeps
 * everything. This is a phone fix, not a redesign.
 */
const login = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/auth/LoginScreen.tsx"),
  "utf8",
)
const server = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/server/ServerScreen.tsx"),
  "utf8",
)

describe("B20: the way in is above the fold", () => {
  it.each([
    ["login", () => login],
    ["server", () => server],
  ])("keeps the %s splash to the mark and the name on a phone", (_name, read) => {
    const source = read()
    expect(source).toContain('{tablet ? <Text style={styles.introTitle}>')
    expect(source).toContain('{tablet ? <Text style={styles.introBody}>')
    expect(source).toContain("{tablet ? (\n            <View style={styles.steps}")
  })

  it("lays the mark beside the name instead of above it", () => {
    for (const source of [login, server]) {
      expect(source).toContain('brandRow: { flexDirection: "row", alignItems: "center"')
      expect(source).toContain('brandRowTablet: { flexDirection: "column"')
      // 58 px stacked with a margin was a third of the splash budget.
      const mark = source.slice(source.indexOf("  brandMark: {"), source.indexOf("  brand: {"))
      expect(mark).toContain("width: 42")
      expect(mark).not.toContain("marginBottom")
    }
  })

  it("puts the caret in the first field the screen asks about", () => {
    expect(login.slice(login.indexOf('testID="login-email"'), login.indexOf('testID="login-password"'))).toContain("autoFocus")
    expect(server.slice(server.indexOf('testID="tenant-input"'), server.indexOf("style={styles.input}"))).toContain("autoFocus")
  })

  it("leaves the tablet layout with its full introduction", () => {
    for (const source of [login, server]) {
      expect(source).toContain("styles.introTablet")
      expect(source).toContain("brandMarkTablet")
      expect(source).toContain("styles.steps")
    }
  })
})
