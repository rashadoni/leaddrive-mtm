/**
 * Doctors of one clinic, one after another, on one arrival (Zeytun
 * 2026-11-13: «чтоб можно было делать один визит нескольким врачам, которые
 * находятся в одной клинике»; owner chose variant «А: подряд»).
 *
 * Each doctor keeps a visit of his own — notes, presentations and reports are
 * as before — but the stops of one clinic read as one group, and after a
 * doctor's visit the next doctor of that clinic is offered at once, with no
 * drive in between. A doctor the agent did not find is left as it is: the
 * stop stays unvisited and the day closes it as missed, like any other.
 */

export interface ChainPoint {
  id: string
  status: string
  customer: { id: string; name: string }
  contact?: { id?: string; displayName?: string | null } | null
}

export interface ClinicGroup {
  clinicName: string
  pointIds: string[]
}

const isDoctorStop = (point: ChainPoint) => Boolean(point.contact?.id)

/** Runs of two or more doctor stops in a row at the same place, by stop id. */
export function clinicGroups(points: ChainPoint[]): Map<string, ClinicGroup> {
  const groups = new Map<string, ClinicGroup>()
  let run: ChainPoint[] = []
  const close = () => {
    if (run.length >= 2) {
      const group = { clinicName: run[0].customer.name, pointIds: run.map((point) => point.id) }
      for (const point of run) groups.set(point.id, group)
    }
    run = []
  }
  for (const point of points) {
    if (isDoctorStop(point) && run.length > 0 && run[0].customer.id === point.customer.id) {
      run.push(point)
    } else {
      close()
      if (isDoctorStop(point)) run = [point]
    }
  }
  close()
  return groups
}

/** The next doctor still to see in the same clinic, after `pointId` first, then any earlier one. */
export function nextDoctorInClinic(points: ChainPoint[], pointId: string | null | undefined): ChainPoint | null {
  if (!pointId) return null
  const group = clinicGroups(points).get(pointId)
  if (!group) return null
  const byId = new Map(points.map((point) => [point.id, point]))
  const at = group.pointIds.indexOf(pointId)
  const order = [...group.pointIds.slice(at + 1), ...group.pointIds.slice(0, at)]
  for (const id of order) {
    const point = byId.get(id)
    if (point && point.status === "PENDING") return point
  }
  return null
}

/**
 * The agent is already in this clinic: another doctor of the group is done.
 * Then the stop needs no drive — the panel offers the visit at once.
 */
export function clinicFollowUp(points: ChainPoint[], point: ChainPoint | null): { clinicName: string; doctorsLeft: number } | null {
  if (!point || point.status !== "PENDING") return null
  const group = clinicGroups(points).get(point.id)
  if (!group) return null
  const members = points.filter((candidate) => group.pointIds.includes(candidate.id))
  if (!members.some((member) => member.id !== point.id && member.status === "VISITED")) return null
  return { clinicName: group.clinicName, doctorsLeft: members.filter((member) => member.status === "PENDING").length }
}
