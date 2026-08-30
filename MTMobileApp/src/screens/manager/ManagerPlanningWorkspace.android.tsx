import React, { useCallback, useMemo } from "react"
import PlanningWorkspaceCore, {
  type PlanningWorkspaceAgentSource,
} from "../planning/PlanningWorkspaceCore.android"
import { managerApi } from "../../services/manager-api"
import {
  toPlanningAgent,
  type PlanningAgent,
  type PlanningHorizon,
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

  return (
    <PlanningWorkspaceCore
      onClose={onClose}
      agentSource={agentSource}
      initialDate={initialDate}
      initialHorizon={initialHorizon}
    />
  )
}
