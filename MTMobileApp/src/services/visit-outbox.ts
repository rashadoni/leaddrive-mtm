import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  allOutboxOperations,
  enqueueOutboxOperation,
  type OutboxOperation,
} from "./outbox"
import { requireOfflineScope } from "./offline-scope"

const STORAGE_PREFIX = "@mtm_active_visit_v2:"

export type OptimisticVisit = {
  id: string
  status: "CHECKED_IN"
  checkInAt: string
  customer: { id: string; name: string; address?: string }
  routeId?: string
  routePointId?: string
  pendingCheckOut: boolean
}

export type QueueVisitCheckInInput = {
  customer: { id: string; name: string; address?: string }
  latitude?: number
  longitude?: number
  notes?: string
  routeId?: string
  routePointId?: string
  contactId?: string
  force?: boolean
  visitType?: string
}

function storageKey() {
  return `${STORAGE_PREFIX}${requireOfflineScope()}`
}

function visitId() {
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function readOptimisticVisit(): Promise<OptimisticVisit | null> {
  const raw = await AsyncStorage.getItem(storageKey())
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OptimisticVisit>
    if (
      typeof parsed.id !== "string"
      || parsed.status !== "CHECKED_IN"
      || typeof parsed.checkInAt !== "string"
      || typeof parsed.customer?.id !== "string"
      || typeof parsed.customer?.name !== "string"
    ) return null
    return { ...parsed, pendingCheckOut: parsed.pendingCheckOut === true } as OptimisticVisit
  } catch {
    return null
  }
}

async function saveOptimisticVisit(visit: OptimisticVisit) {
  await AsyncStorage.setItem(storageKey(), JSON.stringify(visit))
}

export async function clearOptimisticVisit() {
  await AsyncStorage.removeItem(storageKey())
}

export async function queueVisitCheckIn(input: QueueVisitCheckInInput) {
  const id = visitId()
  const checkInAt = new Date().toISOString()
  const operation = await enqueueOutboxOperation({
    entity: "visits",
    op: "create",
    data: {
      id,
      customerId: input.customer.id,
      status: "CHECKED_IN",
      checkInAt,
      ...(input.latitude !== undefined ? { checkInLat: input.latitude } : {}),
      ...(input.longitude !== undefined ? { checkInLng: input.longitude } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.routeId ? { routeId: input.routeId } : {}),
      ...(input.routePointId ? { routePointId: input.routePointId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.force ? { force: true } : {}),
      ...(input.visitType ? { visitType: input.visitType } : {}),
    },
  })
  const visit: OptimisticVisit = {
    id,
    status: "CHECKED_IN",
    checkInAt,
    customer: input.customer,
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.routePointId ? { routePointId: input.routePointId } : {}),
    pendingCheckOut: false,
  }
  await saveOptimisticVisit(visit)
  return { visit, operation }
}

export async function queueVisitCheckOut(
  visit: OptimisticVisit,
  input: { latitude?: number; longitude?: number; notes?: string },
) {
  const checkOutAt = new Date().toISOString()
  const operation = await enqueueOutboxOperation({
    entity: "visits",
    op: "update",
    data: {
      id: visit.id,
      status: "CHECKED_OUT",
      checkOutAt,
      ...(input.latitude !== undefined ? { checkOutLat: input.latitude } : {}),
      ...(input.longitude !== undefined ? { checkOutLng: input.longitude } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
  })
  const optimistic = { ...visit, pendingCheckOut: true }
  await saveOptimisticVisit(optimistic)
  return { visit: optimistic, operation }
}

function operationForVisit(operation: OutboxOperation, id: string) {
  return operation.entity === "visits" && operation.data.id === id
}

/**
 * Prefer server truth. If the server has not seen the mutation yet, keep the
 * durable optimistic visit. A rejected check-in is removed from the active
 * banner (the conflict centre remains the evidence); a rejected check-out
 * restores the visit because it is still active on the server.
 */
export async function reconcileOptimisticVisit(
  serverActive: OptimisticVisit | null | undefined,
): Promise<OptimisticVisit | null> {
  if (serverActive) {
    const normalized = { ...serverActive, pendingCheckOut: false }
    await saveOptimisticVisit(normalized)
    return normalized
  }

  const local = await readOptimisticVisit()
  if (!local) return null
  const operations = (await allOutboxOperations()).filter((item) => operationForVisit(item, local.id))
  const checkIn = operations.find((item) => item.op === "create")
  const checkOut = operations.find((item) => item.op === "update" && item.data.status === "CHECKED_OUT")

  if (checkIn?.status === "conflict") {
    await clearOptimisticVisit()
    return null
  }
  if (checkOut?.status === "conflict") {
    const restored = { ...local, pendingCheckOut: false }
    await saveOptimisticVisit(restored)
    return restored
  }
  if (checkIn?.status === "pending" || checkOut?.status === "pending") return local

  await clearOptimisticVisit()
  return null
}
