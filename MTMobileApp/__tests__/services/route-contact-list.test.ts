import { toRouteContactListItem } from "../../src/services/route-contact-list"

describe("Route Field contact list projection", () => {
  it("keeps only the v2 card fields and workplace phone", () => {
    const item = toRouteContactListItem({
      id: "contact-1",
      name: "Dr. Field",
      specialty: "Cardiology",
      type: "DOCTOR",
      category: "A",
      phone: "+994 50 must-not-project",
      email: "must-not-project@example.test",
      fieldPotentials: [{ value: 100 }],
      workplace: { name: "Clinic A", phone: "+994 12 111 11 11", address: "must-not-project" },
    })

    expect(item).toEqual({
      id: "contact-1",
      name: "Dr. Field",
      specialty: "Cardiology",
      type: "DOCTOR",
      category: "A",
      workplace: "Clinic A",
      phone: "+994 12 111 11 11",
    })
    expect(JSON.stringify(item)).not.toContain("must-not-project")
    expect(JSON.stringify(item)).not.toContain("must-not-project@example.test")
    expect(item).not.toHaveProperty("fieldPotentials")
  })
})
