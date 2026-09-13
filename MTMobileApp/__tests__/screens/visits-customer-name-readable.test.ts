import fs from "fs"
import path from "path"

/**
 * On the phone (2026-09-13) the unplanned-visit list cut every customer name to
 * "ADV-DE…": the "Koordinatlar göstərilməyib" pill sat in the right-hand
 * column beside the name and took the row's width.
 */
const visit = fs.readFileSync(path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"), "utf8")
const copyColumn = visit.slice(visit.indexOf("<View style={styles.customerCopy}>"), visit.indexOf("<View style={styles.customerMeta}>"))
const metaColumn = visit.slice(visit.indexOf("<View style={styles.customerMeta}>"), visit.indexOf("<Icon", visit.indexOf("<View style={styles.customerMeta}>")))

describe("unplanned visit list: the name keeps its width", () => {
  it("shows the coordinate state under the address, not beside the name", () => {
    expect(copyColumn).toContain("copy.coordinatesMissing")
    expect(copyColumn).toContain("copy.coordinatesSuspicious")
    expect(metaColumn).not.toContain("copy.coordinatesMissing")
    expect(metaColumn).not.toContain("copy.coordinatesSuspicious")
  })

  it("sets the moved state at the 12 px floor", () => {
    expect(visit).toContain('customerStateText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },')
  })
})
