import type { ContactDetail, ContactWorkplace } from "../../services/contact-detail"

export type ContactPrimaryActionKind = "call" | "whatsapp" | "email" | "workplace" | "edit" | "none"

export interface ContactPrimaryAction {
  kind: ContactPrimaryActionKind
  value?: string
  workplace?: ContactWorkplace
}

export interface ContactSnapshot {
  activeWorkplaces: number
  activeBrands: number
  pendingBrands: number
  pendingChanges: number
  currentScore?: number
  primaryWorkplace?: ContactWorkplace
  activePotentialValue: number
  activeCoverageValue: number
  activeCoveragePct: number
}

export function selectContactPrimaryAction(detail: ContactDetail, canChange: boolean): ContactPrimaryAction {
  const phone = detail.mobilePhone || detail.phone || detail.workPhone
  if (phone) return { kind: "call", value: phone }
  if (detail.whatsappPhone) return { kind: "whatsapp", value: detail.whatsappPhone }
  if (detail.email) return { kind: "email", value: detail.email }

  const activeWorkplaces = detail.workplaces.filter((item) => !item.endedOn && item.customerId)
  const workplace = activeWorkplaces.find((item) => item.isPrimary) ?? activeWorkplaces[0]
  if (workplace) return { kind: "workplace", workplace }
  if (canChange) return { kind: "edit" }
  return { kind: "none" }
}

export function buildContactSnapshot(detail: ContactDetail): ContactSnapshot {
  const activeWorkplaces = detail.workplaces.filter((item) => !item.endedOn)
  const activeBrands = detail.brandPotentials.filter((item) => !["ENDED", "REJECTED"].includes(item.status))
  const activePotentialValue = activeBrands.reduce((sum, item) => sum + item.potentialValue, 0)
  const activeCoverageValue = activeBrands.reduce((sum, item) => sum + item.coverageValue, 0)
  const primaryWorkplace = activeWorkplaces.find((item) => item.isPrimary) ?? activeWorkplaces[0]
  return {
    activeWorkplaces: activeWorkplaces.length,
    activeBrands: activeBrands.length,
    pendingBrands: detail.brandPotentials.filter((item) => item.status === "PENDING").length,
    pendingChanges: detail.changeRequests.filter((item) => ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"].includes(item.status)).length,
    currentScore: detail.doctorAssessments[0]?.actualScore,
    primaryWorkplace,
    activePotentialValue,
    activeCoverageValue,
    activeCoveragePct: activePotentialValue > 0 ? Math.round((activeCoverageValue / activePotentialValue) * 1000) / 10 : 0,
  }
}
