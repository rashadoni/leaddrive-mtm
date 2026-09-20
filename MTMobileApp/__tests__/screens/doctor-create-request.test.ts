import fs from "fs"
import path from "path"

const screen = fs.readFileSync(path.resolve(__dirname, "../../src/screens/base/DoctorCreateRequestScreen.tsx"), "utf8")
const contacts = fs.readFileSync(path.resolve(__dirname, "../../src/screens/base/RouteContactsList.android.tsx"), "utf8")
const api = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")

describe("mobile new doctor request", () => {
  it("collects the required doctor and clinic fields without creating a record directly", () => {
    for (const field of ["displayName", "specialtyName", "phone", "clinicName", "address", "notes"]) {
      expect(screen).toContain(field)
    }
    expect(screen).toContain("submitDoctorCreateRequest")
    expect(screen).toContain("только после одобрения")
  })

  it("is reachable from the scoped contact catalog", () => {
    expect(contacts).toContain('navigation.navigate("DoctorCreateRequest")')
    expect(contacts).toContain("Добавить врача")
  })

  it("uses the v2 Route Field boundary", () => {
    expect(api).toContain('this.request("/mobile/route-field/contact-create-requests"')
    expect(api).toContain("}, 20_000, 2)")
  })
})

describe("new doctor request — what the agent is told when it fails", () => {
  it("never prints a machine code where a person reads it", () => {
    expect(screen).toContain("/^[A-Z][A-Z0-9_]*$/.test(message)")
    expect(screen).toContain("technical ? copy.failed : message")
  })
})
