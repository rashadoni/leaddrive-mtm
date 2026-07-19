/**
 * Pure mapper for the visit workspace (GET /mobile/visits/[id]/workspace).
 * Kept outside the screen so the requirement-vs-result join and the flattening
 * are unit-tested. Read-only: shows what happened on the visit (time, result,
 * required actions, tasks).
 */

export interface VisitRequirement {
  actionKey: string
  mode: string
  done: boolean
  waived: boolean
}

export interface VisitTaskItem {
  id: string
  title: string
  status: string
}

export interface VisitWorkspace {
  id: string
  status: string
  checkInAt?: string
  checkOutAt?: string
  duration?: number
  outcome?: string
  potential?: string
  resultNotes?: string
  notes?: string
  customer: { name: string; objectType?: string; address?: string; phone?: string }
  contact?: { name: string; type?: string; specialty?: string; phone?: string }
  requirements: VisitRequirement[]
  tasks: VisitTaskItem[]
  photosCount: number
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function toVisitWorkspace(raw: any): VisitWorkspace {
  const customer = (raw?.customer ?? {}) as Record<string, unknown>
  const contactRaw = raw?.contact ? (raw.contact as Record<string, unknown>) : null
  const requirements = Array.isArray(raw?.requirementSnapshot?.requirements)
    ? (raw.requirementSnapshot.requirements as any[])
    : []
  const results = Array.isArray(raw?.actionResults) ? (raw.actionResults as any[]) : []
  const tasks = Array.isArray(raw?.tasks) ? (raw.tasks as any[]) : []
  const photos = Array.isArray(raw?.photos) ? (raw.photos as any[]) : []

  const mappedRequirements: VisitRequirement[] = requirements
    .filter((r) => str(r?.mode) !== "HIDDEN")
    .map((r) => {
      const result = results.find(
        (a) => (r?.id && a?.requirementId === r.id) || (r?.actionKey && a?.actionKey === r.actionKey),
      )
      const status = str(result?.status)
      return {
        actionKey: str(r?.actionKey) ?? "",
        mode: str(r?.mode) ?? "",
        done: status === "COMPLETED",
        waived: status === "WAIVED",
      }
    })

  return {
    id: String(raw?.id ?? ""),
    status: str(raw?.status) ?? "",
    checkInAt: str(raw?.checkInAt),
    checkOutAt: str(raw?.checkOutAt),
    duration: num(raw?.duration),
    outcome: str(raw?.outcome),
    potential: str(raw?.potential),
    resultNotes: str(raw?.resultNotes),
    notes: str(raw?.notes),
    customer: {
      name: str(customer.name) ?? "",
      objectType: str(customer.objectType),
      address: str(customer.address),
      phone: str(customer.phone),
    },
    contact: contactRaw
      ? {
          name: str(contactRaw.displayName) ?? "",
          type: str(contactRaw.type),
          specialty: str(contactRaw.specialtyName),
          phone: str(contactRaw.phone),
        }
      : undefined,
    requirements: mappedRequirements,
    tasks: tasks.map((t) => ({ id: String(t?.id ?? ""), title: str(t?.title) ?? "", status: str(t?.status) ?? "" })),
    photosCount: photos.length,
  }
}
