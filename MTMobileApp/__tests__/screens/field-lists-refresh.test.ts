import fs from "fs"
import path from "path"

const places = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteOrganizationExplorerScreen.android.tsx"),
  "utf8",
)
const contacts = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteContactsList.android.tsx"),
  "utf8",
)

/**
 * Acceptance on a real phone, 2026-09-20: a client unassigned from the agent
 * in the office stayed in «Места» — pulling to refresh on Today did not touch
 * the list, because the screen keeps its rows while the agent is elsewhere and
 * only fetched on its first mount.
 */
describe("field lists ask the server again when they come back into view", () => {
  for (const [name, source] of [["places", places], ["contacts", contacts]] as const) {
    it(`refreshes the ${name} list on focus`, () => {
      expect(source).toContain('import { useFocusEffect, useNavigation } from "@react-navigation/native"')
      expect(source).toContain("useFocusEffect(")
      expect(source).toContain("void loadRows(debouncedSearch)")
    })

    it(`does not fetch the ${name} list twice when it opens`, () => {
      expect(source).toContain("const focusedOnce = useRef(false)")
      expect(source).toContain("if (!focusedOnce.current) {")
    })
  }
})
