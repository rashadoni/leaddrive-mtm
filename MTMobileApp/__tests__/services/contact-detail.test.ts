import { toContactDetail } from "../../src/services/contact-detail"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("contact detail mapping", () => {
  it("flattens workplaces onto the detail shape", () => {
    const detail = toContactDetail({
      id: "k1",
      displayName: "Dr. Aliyev",
      specialtyName: "Cardiology",
      type: "DOCTOR",
      category: "A",
      status: "ACTIVE",
      phone: "+994111",
      email: "a@x.az",
      externalCode: "EXT-1",
      notes: "VIP",
      workplaces: [
        { id: "w1", isPrimary: true, jobTitle: "Head", department: "Cardiology", customer: { id: "c1", name: "Central Clinic", objectType: "CLINIC", city: "Baku" } },
        { isPrimary: false, customer: { id: "c2", name: "Second Clinic" } },
      ],
    })
    expect(detail.name).toBe("Dr. Aliyev")
    expect(detail.email).toBe("a@x.az")
    expect(detail.workplaces).toHaveLength(2)
    expect(detail.workplaces[0]).toMatchObject({ id: "w1", customerId: "c1", name: "Central Clinic", objectType: "CLINIC", city: "Baku", isPrimary: true, jobTitle: "Head", department: "Cardiology" })
    expect(detail.workplaces[1].isPrimary).toBe(false)
    expect(detail.workplaces[1].objectType).toBeUndefined()
  })

  it("maps the full personal, communication, address, review and history envelope", () => {
    const detail = toContactDetail({
      id: "k3", updatedAt: "2026-07-21T08:00:00.000Z", displayName: "Mammadov Farid",
      firstName: "Farid", lastName: "Mammadov", middleName: "Ali", birthDate: "1980-02-03T00:00:00.000Z",
      mobilePhone: "+99450", whatsappPhone: "+99450", addressRegion: "Baku", addressStreet: "Nizami 1",
      verificationStatus: "VERIFIED", consentStatus: "GRANTED", contactPreference: "WHATSAPP", source: "IMPORT",
      changeRequests: [{ id: "r1", kind: "CONTACT_UPDATE", status: "SUBMITTED", reason: "Field verified", requestedByAgent: { name: "Agent A" } }],
    }, {
      capabilities: { canManage: false, canRequestChanges: true },
      history: [{ id: "h1", action: "CONTACT_UPDATE", entity: "contact", createdAt: "2026-07-21T09:00:00.000Z", agent: { name: "Manager" } }],
    })
    expect(detail).toMatchObject({ firstName: "Farid", lastName: "Mammadov", birthDate: "1980-02-03", mobilePhone: "+99450", addressRegion: "Baku", verificationStatus: "VERIFIED", canRequestChanges: true })
    expect(detail.changeRequests[0]).toMatchObject({ id: "r1", requesterName: "Agent A" })
    expect(detail.history[0]).toMatchObject({ id: "h1", actorName: "Manager" })
  })

  it("tolerates a contact with no workplaces", () => {
    const detail = toContactDetail({ id: "k2", displayName: "Solo" })
    expect(detail.workplaces).toEqual([])
    expect(detail.phone).toBeUndefined()
    expect(detail.doctorAssessments).toEqual([])
  })

  it("maps append-only pharmaceutical doctor scoring for live and offline cards", () => {
    const detail = toContactDetail({
      id: "k4",
      displayName: "Dr Leyla",
      doctorAssessments: [{
        id: "score-1",
        clientAssessmentId: "mobile-score-1",
        office: "12",
        patientsPerMonth: 320,
        bedCount: 40,
        isKol: true,
        kolLevel: "Regional",
        psychotype: "Analytical",
        granularCategory: "B2",
        actualScore: "72.5000",
        targetScore: "80.0000",
        periodStart: "2026-07-01T00:00:00.000Z",
        source: "MANAGER_INTERVIEW",
        formulaVersion: "2026.1",
        formula: { name: "Doctor score", signedAt: "2026-06-30T12:00:00.000Z" },
        status: "VERIFIED",
        enteredByAgent: { name: "Manager" },
      }],
    })
    expect(detail.doctorAssessments).toHaveLength(1)
    expect(detail.doctorAssessments[0]).toMatchObject({
      id: "score-1",
      patientsPerMonth: 320,
      isKol: true,
      granularCategory: "B2",
      actualScore: 72.5,
      periodStart: "2026-07-01",
      formulaVersion: "2026.1",
      formulaName: "Doctor score",
      status: "VERIFIED",
      enteredByName: "Manager",
    })
  })

  it("maps per-brand potential history, validation provenance and evidence visits", () => {
    const detail = toContactDetail({
      id: "k5",
      displayName: "Dr Brand",
      fieldPotentials: [{
        id: "potential-1",
        clientPotentialId: "mobile-potential-1",
        brandExternalId: "brand-acc",
        brandName: "ACC",
        productExternalId: "acc-200",
        productName: "ACC 200 mg",
        categoryLabel: "B2",
        potentialValue: "80.00",
        coverageValue: "25.00",
        periodStart: "2026-07-01T00:00:00.000Z",
        source: "FIELD_INTERVIEW",
        status: "VERIFIED",
        agent: { id: "agent-1", name: "Agent A" },
        enteredByAgent: { name: "Agent A" },
        reviewedByAgent: { name: "Manager" },
        evidenceVisits: [{ visit: { id: "visit-1", checkInAt: "2026-07-03T08:00:00.000Z", status: "CHECKED_OUT", customer: { name: "Central Clinic" } } }],
      }],
    }, {
      capabilities: { canRecordBrandPotential: true, canReviewBrandPotential: false, brandPotentialPerAgent: true },
      eligibleBrandPotentialVisits: [{ id: "visit-2", agentId: "agent-1", checkInAt: "2026-07-10T08:00:00.000Z", customer: { name: "North Clinic" } }],
    })
    expect(detail.brandPotentials[0]).toMatchObject({
      id: "potential-1",
      brandName: "ACC",
      productName: "ACC 200 mg",
      categoryLabel: "B2",
      potentialValue: 80,
      coverageValue: 25,
      coveragePct: 31.3,
      status: "VERIFIED",
      agentName: "Agent A",
      reviewedByName: "Manager",
    })
    expect(detail.brandPotentials[0].evidenceVisits[0]).toMatchObject({ id: "visit-1", customerName: "Central Clinic" })
    expect(detail.brandPotentialEligibleVisits[0]).toMatchObject({ id: "visit-2", agentId: "agent-1", customerName: "North Clinic" })
    expect(detail.canRecordBrandPotential).toBe(true)
    expect(detail.brandPotentialPerAgent).toBe(true)
  })

  describe("i18n contract", () => {
    const KEYS = ["detailInfo", "detailWorkplaces", "detailNoWorkplaces", "detailOfflineNote", "fieldType", "sectionPersonal", "requestEditTitle", "changeHistory", "tab_scoring", "tab_brands", "scoringTitle", "scoringNoActiveFormula", "scoringStatus_VERIFIED"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])(
      "contacts detail keys present in %s",
      (_lang, locale) => {
        const ns = (locale as { contacts: Record<string, unknown> }).contacts
        for (const key of KEYS) {
          expect(typeof ns[key]).toBe("string")
          expect((ns[key] as string).length).toBeGreaterThan(0)
        }
      },
    )
  })

  describe("brand potential i18n contract", () => {
    const KEYS = ["workflow", "heroTitle", "add", "newVersion", "evidenceVisits", "queued", "syncConflict", "status_PENDING", "status_VERIFIED", "status_REJECTED", "status_ENDED"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])("potential keys present in %s", (_lang, locale) => {
      const ns = (locale as { potential: Record<string, unknown> }).potential
      for (const key of KEYS) expect(typeof ns[key]).toBe("string")
    })
  })
})
