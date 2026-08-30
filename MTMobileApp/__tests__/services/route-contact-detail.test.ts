import { toRouteContactDetail } from "../../src/services/route-contact-detail"

describe("Route Field contact projection", () => {
  it("keeps only contact and workplace data needed for a route", () => {
    const detail = toRouteContactDetail({
      id: "contact-1",
      displayName: "Dr. Field",
      specialtyName: "Cardiology",
      mobilePhone: "+994501234567",
      addressStreet: "Nizami 1",
      fieldPotentials: [{ brandName: "Must not be projected" }],
      doctorAssessments: [{ score: 100 }],
      capabilities: { canRecordBrandPotential: true },
      workplaces: [{
        id: "workplace-1",
        customer: { name: "Clinic A", address: "Nizami 2", city: "Baku" },
        isPrimary: true,
        jobTitle: "Doctor",
      }],
    })

    expect(detail).toEqual({
      id: "contact-1",
      name: "Dr. Field",
      specialty: "Cardiology",
      type: undefined,
      category: undefined,
      status: undefined,
      phone: undefined,
      email: undefined,
      messengerPhone: undefined,
      workPhone: undefined,
      homePhone: undefined,
      mobilePhone: "+994501234567",
      addressRegion: undefined,
      addressLocality: undefined,
      addressDistrict: undefined,
      addressStreet: "Nizami 1",
      workplaces: [{
        id: "workplace-1",
        name: "Clinic A",
        city: "Baku",
        address: "Nizami 2",
        isPrimary: true,
        jobTitle: "Doctor",
        phone: undefined,
      }],
    })
    expect(detail).not.toHaveProperty("fieldPotentials")
    expect(detail).not.toHaveProperty("doctorAssessments")
    expect(detail).not.toHaveProperty("capabilities")
  })
})
