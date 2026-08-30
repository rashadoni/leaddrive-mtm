import fs from "fs"
import path from "path"

const coreApiSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/services/api.ts"),
  "utf8",
)
const commercialApiSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/services/commercial-api.ts"),
  "utf8",
)
const legacyContactSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/ContactDetailScreen.tsx"),
  "utf8",
)
const legacyContactsListSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/ContactsList.tsx"),
  "utf8",
)
const scoringModalSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/components/DoctorAssessmentModal.tsx"),
  "utf8",
)

describe("legacy commercial API boundary", () => {
  it("keeps commercial mutation literals out of the active Route Field core client", () => {
    const commercialOnlyEndpoints = [
      "/contacts/${id}",
      "/contacts/${id}/change-requests",
      "/contacts/${id}/workplaces",
      "/doctor-scoring/formulas",
      "/contacts/${contactId}/assessments",
      "/doctor-assessments/${id}/decision",
      "/contacts/${contactId}/brand-potentials",
      "/field-potentials/${id}/decision",
      "/field-potentials/${id}/end",
    ]

    for (const endpoint of commercialOnlyEndpoints) {
      expect(coreApiSource).not.toContain(endpoint)
      expect(commercialApiSource).toContain(endpoint)
    }

    const movedMethods = [
      "getContacts",
      "getContact",
      "updateContact",
      "submitContactChange",
      "upsertContactWorkplace",
      "endContactWorkplace",
      "getDoctorScoringFormulas",
      "createDoctorAssessment",
      "decideDoctorAssessment",
      "createBrandPotential",
      "decideBrandPotential",
      "endBrandPotential",
    ]
    for (const method of movedMethods) {
      expect(coreApiSource).not.toContain(`async ${method}(`)
      expect(commercialApiSource).toContain(`${method}(`)
    }
    expect(commercialApiSource).toContain("idempotencyKey: string")
  })

  it("preserves the shared authenticated legacy transport and keeps legacy consumers on the facade", () => {
    expect(commercialApiSource).toContain('import { api } from "./api"')
    expect(commercialApiSource).toContain("api.requestLegacy")
    expect(legacyContactSource).toContain('import { commercialApi } from "../../services/commercial-api"')
    expect(legacyContactSource).toContain("commercialApi.getContact")
    expect(legacyContactSource).not.toContain("api.getContact")
    expect(legacyContactsListSource).toContain('import { commercialApi } from "../../services/commercial-api"')
    expect(legacyContactsListSource).toContain("commercialApi.getContacts")
    expect(legacyContactsListSource).not.toContain("api.getContacts")
    expect(legacyContactSource).not.toContain("api.updateContact")
    expect(legacyContactSource).not.toContain("api.createBrandPotential")
    expect(scoringModalSource).toContain("commercialApi.getDoctorScoringFormulas")
    expect(scoringModalSource).not.toContain("api.getDoctorScoringFormulas")
  })
})
