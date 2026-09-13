import fs from "fs"
import path from "path"

/**
 * On the phone (2026-09-13) the owner pointed at the chip under the date on
 * "Today": "1 diqqət tələb edir", unreadable. The header uses the `inverse`
 * chip, whose text is white; a sync conflict repaints the chip #fff7ed but kept
 * the white text — 1.06:1. The conflict colours must win over `inverse`.
 */
const chip = fs.readFileSync(path.resolve(__dirname, "../../src/components/SyncStatusChip.tsx"), "utf8")

function hex(name: string): string {
  const m = chip.match(new RegExp(`  ${name}: \\{[^}]*?(?:color|backgroundColor): "(#[0-9a-f]{6})"`))
  return m ? m[1] : ""
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("sync chip stays readable during a conflict", () => {
  it("applies the conflict text colours after the inverse ones", () => {
    const icon = chip.slice(chip.indexOf("<Text style={[styles.chipIcon"), chip.indexOf("]}>", chip.indexOf("<Text style={[styles.chipIcon")))
    const label = chip.slice(chip.indexOf("<Text style={[styles.chipLabel"), chip.indexOf("]}", chip.indexOf("<Text style={[styles.chipLabel")))
    expect(icon.indexOf("styles.conflictIcon")).toBeGreaterThan(icon.indexOf("styles.inverseText"))
    expect(label.indexOf("styles.conflictLabel")).toBeGreaterThan(label.indexOf("styles.inverseText"))
  })

  it("meets 4.5:1 against the conflict background", () => {
    const background = hex("chipConflict")
    const ratios = {
      label: contrast(hex("conflictLabel"), background),
      icon: contrast(hex("conflictIcon"), background),
    }
    expect(background).toBe("#fff7ed")
    expect(ratios.label).toBeGreaterThanOrEqual(4.5)
    expect(ratios.icon).toBeGreaterThanOrEqual(4.5)
  })
})
