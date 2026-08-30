import { toRouteContactDetail } from "../../src/services/route-contact-detail"

describe("Route Field contact projection", () => {
  it("keeps only the v2 route projection and drops injected private or commercial data", () => {
    const detail = toRouteContactDetail({
      id: "contact-1",
      name: "Dr. Field",
      specialty: "Cardiology",
      type: "DOCTOR",
      category: "A",
      status: "ACTIVE",
      email: "must-not-project@example.test",
      mobilePhone: "+994501234567",
      addressStreet: "Nizami 1",
      fieldPotentials: [{ brandName: "Must not be projected" }],
      doctorAssessments: [{ score: 100 }],
      capabilities: { canRecordBrandPotential: true },
      workplaces: [{
        id: "workplace-1",
        name: "Clinic A",
        address: "Nizami 2",
        city: "Baku",
        isPrimary: true,
        jobTitle: "Doctor",
        phone: "+994 12 111 11 11",
        customer: { latitude: 40.4, longitude: 49.8 },
        department: "Must not be projected",
      }],
    })

    expect(detail).toEqual({
      id: "contact-1",
      name: "Dr. Field",
      specialty: "Cardiology",
      type: "DOCTOR",
      category: "A",
      status: "ACTIVE",
      workplaces: [{
        id: "workplace-1",
        name: "Clinic A",
        city: "Baku",
        address: "Nizami 2",
        isPrimary: true,
        jobTitle: "Doctor",
        phone: "+994 12 111 11 11",
      }],
    })
    expect(detail).not.toHaveProperty("fieldPotentials")
    expect(detail).not.toHaveProperty("doctorAssessments")
    expect(detail).not.toHaveProperty("capabilities")
    expect(JSON.stringify(detail)).not.toContain("must-not-project@example.test")
    expect(JSON.stringify(detail)).not.toContain("+994501234567")
    expect(JSON.stringify(detail)).not.toContain("Nizami 1")
    expect(JSON.stringify(detail)).not.toContain("Must not be projected")
  })
})
