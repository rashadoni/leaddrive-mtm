import React, { useCallback, useMemo } from "react"
import PlanningWorkspaceCore, {
  type PlanningWorkspaceAgentSource,
  type PlanningWorkspaceTargetSource,
} from "../planning/PlanningWorkspaceCore.android"
import { commercialApi } from "../../services/commercial-api"
import { managerApi } from "../../services/manager-api"
import {
  toPlanningAgent,
  toPlanningContactTarget,
  toPlanningOrganizationTarget,
  type PlanningAgent,
  type PlanningHorizon,
  type PlanningTarget,
} from "../../services/manager-planning"

/**
 * Legacy manager-only planner adapter. It is intentionally separate from the
 * Route Field navigator: TEAM_READ and the manager transport facade remain
 * unreachable from the Route Field APK's self-planning entry point.
 */
export default function ManagerPlanningWorkspace({
  onClose,
  initialDate,
  initialHorizon,
}: {
  onClose?: () => void
  initialDate?: string
  initialHorizon?: PlanningHorizon
} = {}) {
  const loadAgents = useCallback(async (): Promise<PlanningAgent[]> => {
    const response = await managerApi.getTeam()
    const rawAgents: unknown[] = Array.isArray(response?.data?.agents) ? response.data.agents : []
    return rawAgents
      .map(toPlanningAgent)
      .filter((agent): agent is PlanningAgent => agent !== null)
  }, [])

  const agentSource = useMemo<PlanningWorkspaceAgentSource>(
    () => ({ kind: "team", loadAgents }),
    [loadAgents],
  )

  const loadTargets = useCallback<PlanningWorkspaceTargetSource["loadTargets"]>(async (query, signal) => {
    const parsedPage = Number(query.continuation ?? "1")
    const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const limit = 50
    const response = query.kind === "organization"
      ? await managerApi.getOrganizations({
          search: query.search,
          page,
          limit,
          objectType: query.objectType,
          organizationKind: query.organizationKind,
        }, signal)
      : await commercialApi.getContacts({ search: query.search, page, limit }, signal)
    const rawTargets: unknown[] = query.kind === "organization"
      ? (Array.isArray(response?.data?.organizations) ? response.data.organizations : [])
      : (Array.isArray(response?.data?.contacts) ? response.data.contacts : [])
    const mapper = query.kind === "organization" ? toPlanningOrganizationTarget : toPlanningContactTarget
    const targets = rawTargets.map(mapper).filter((target): target is PlanningTarget => target !== null)
    const rawTotal = Number(response?.data?.total)
    const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : null
    return {
      targets,
      total,
      nextPage: total !== null && (page * limit) < total ? String(page + 1) : null,
    }
  }, [])

  const targetSource = useMemo<PlanningWorkspaceTargetSource>(() => ({ loadTargets }), [loadTargets])

  return (
    <PlanningWorkspaceCore
      onClose={onClose}
      agentSource={agentSource}
      targetSource={targetSource}
      initialDate={initialDate}
      initialHorizon={initialHorizon}
    />
  )
}
