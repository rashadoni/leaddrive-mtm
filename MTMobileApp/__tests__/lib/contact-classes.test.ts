import fs from "fs"
import path from "path"
import {
  CONTACT_CLASS_DEFAULTS,
  contactClassColors,
  contactClassOptions,
  organizationClassFilterOptions,
  parseContactClasses,
  tenantContactClasses,
} from "../../src/lib/contact-classes"

/**
 * An organization chooses which classes it grades clients with (web setting
 * `contactClasses`, e.g. "A, B, C, VIP"); the bootstrap carries the list as
 * `policies.contactClasses`. The app used to list a hard-coded A–D.
 */
const SRC = path.resolve(__dirname, "../../src")
const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8")

describe("parseContactClasses", () => {
  it("keeps known classes in the order the web card offers them", () => {
    expect(parseContactClasses(["VIP", "C", "A", "B"])).toEqual(["A", "B", "C", "VIP"])
    expect(parseContactClasses(["A", "A", "VIP"])).toEqual(["A", "VIP"])
  })

  it("drops what this build does not know", () => {
    expect(parseContactClasses(["A", "S", 5, null, "vip"])).toEqual(["A"])
  })

  it("has no answer for a missing list or junk, so the caller falls back", () => {
    expect(parseContactClasses(undefined)).toBeUndefined()
    expect(parseContactClasses(null)).toBeUndefined()
    expect(parseContactClasses("A,B,C")).toBeUndefined()
    expect(parseContactClasses([])).toBeUndefined()
    expect(parseContactClasses(["S", 5])).toBeUndefined()
  })
})

describe("tenantContactClasses", () => {
  it("is A–D until the server sends the organization's list", () => {
    expect(tenantContactClasses(undefined)).toEqual(["A", "B", "C", "D"])
    expect(tenantContactClasses(null)).toEqual(["A", "B", "C", "D"])
    expect(tenantContactClasses({})).toEqual(["A", "B", "C", "D"])
    expect(tenantContactClasses({ contactClasses: [] })).toEqual(["A", "B", "C", "D"])
  })

  it("follows the organization's list", () => {
    expect(tenantContactClasses({ contactClasses: ["A", "B", "C", "VIP"] })).toEqual(["A", "B", "C", "VIP"])
  })

  it("hands out a copy, never the shared defaults", () => {
    const classes = tenantContactClasses(undefined)
    classes.push("VIP")
    expect(CONTACT_CLASS_DEFAULTS).toEqual(["A", "B", "C", "D"])
    expect(tenantContactClasses(undefined)).toEqual(["A", "B", "C", "D"])
  })
})

describe("contactClassOptions", () => {
  const withVip = { contactClasses: ["A", "B", "C", "VIP"] }

  it("offers the organization's classes, VIP included", () => {
    expect(contactClassOptions(withVip)).toEqual(["A", "B", "C", "VIP"])
    expect(contactClassOptions(withVip, "VIP")).toEqual(["A", "B", "C", "VIP"])
    expect(contactClassOptions(withVip, null)).toEqual(["A", "B", "C", "VIP"])
    expect(contactClassOptions(withVip, "")).toEqual(["A", "B", "C", "VIP"])
  })

  it("keeps the class a client already has when the organization stopped offering it", () => {
    expect(contactClassOptions(withVip, "D")).toEqual(["A", "B", "C", "D", "VIP"])
  })

  it("lists a VIP client's class before the server sends the list", () => {
    expect(contactClassOptions(undefined)).toEqual(["A", "B", "C", "D"])
    expect(contactClassOptions(undefined, "VIP")).toEqual(["A", "B", "C", "D", "VIP"])
    expect(contactClassOptions({}, "B")).toEqual(["A", "B", "C", "D"])
  })

  it("keeps a class this build has never heard of, at the end", () => {
    expect(contactClassOptions(withVip, "S")).toEqual(["A", "B", "C", "VIP", "S"])
  })
})

describe("organizationClassFilterOptions", () => {
  it("is A–D by default", () => {
    expect(organizationClassFilterOptions(undefined)).toEqual(["A", "B", "C", "D"])
  })

  it("adds what the organization enabled and never drops D", () => {
    expect(organizationClassFilterOptions({ contactClasses: ["A", "B", "C", "VIP"] })).toEqual(["A", "B", "C", "D", "VIP"])
  })
})

describe("contactClassColors", () => {
  const fallback = contactClassColors("D")

  it("gives VIP a pair of its own, not the grey of an unknown class", () => {
    const vip = contactClassColors("VIP")
    expect(vip).not.toEqual(fallback)
    const others = ["A", "B", "C", "D", undefined, null, "S"].map((value) => contactClassColors(value))
    expect(others.filter((pair) => pair.strong === vip.strong || pair.soft === vip.soft)).toEqual([])
  })

  it("keeps A, B and C distinct and leaves the rest on the neutral pair", () => {
    const strong = ["VIP", "A", "B", "C"].map((value) => contactClassColors(value).strong)
    expect(new Set(strong).size).toBe(4)
    expect(contactClassColors(undefined)).toEqual(fallback)
    expect(contactClassColors("S")).toEqual(fallback)
  })
})

describe("screens read the classes from one place", () => {
  it("leaves no hard-coded class list outside the helper", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name) && /\["A",\s*"B",\s*"C"/.test(fs.readFileSync(full, "utf8"))) {
          offenders.push(path.relative(SRC, full))
        }
      }
    }
    walk(SRC)
    expect(offenders).toEqual(["lib/contact-classes.ts"])
  })

  it("colours the class badge through the shared helper on the lists", () => {
    for (const file of [
      "screens/base/ContactsList.tsx",
      "screens/base/RouteContactsList.android.tsx",
      "screens/base/RouteOrganizationExplorerScreen.android.tsx",
    ]) {
      expect([file, read(file).includes("contactClassColors(item.category)")]).toEqual([file, true])
    }
  })

  it("gives VIP its colour before A on the screens with a palette of their own", () => {
    const explorer = read("screens/base/OrganizationExplorerScreen.tsx")
    expect(explorer.indexOf('if (category === "VIP")')).toBeGreaterThan(-1)
    expect(explorer.indexOf('if (category === "VIP")')).toBeLessThan(explorer.indexOf('if (category === "A")'))
    const visit = read("screens/visit/VisitScreen.tsx")
    expect(visit.indexOf('case "VIP":')).toBeGreaterThan(-1)
    expect(visit.indexOf('case "VIP":')).toBeLessThan(visit.indexOf('case "A":'))
  })

  it("filters organizations by the organization's classes", () => {
    const explorer = read("screens/base/OrganizationExplorerScreen.tsx")
    expect(explorer).toContain("const classOptions = useMemo(() => organizationClassFilterOptions(policies), [policies])")
    expect(explorer).toContain('<FilterRow label={t("organizations.category")} values={classOptions}')
  })
})
