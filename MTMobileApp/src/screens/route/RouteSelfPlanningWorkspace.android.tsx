import React, { useMemo } from "react"
import PlanningWorkspaceCore, {
  type PlanningWorkspaceAgentSource,
} from "../planning/PlanningWorkspaceCore.android"
import { useBootstrapStore } from "../../store/bootstrap"
import { useAuthStore } from "../../store/auth"
import type { PlanningHorizon } from "../../services/manager-planning"

/**
 * Route Field's only planning entry point. It never receives a team ID or a
 * manager loader: the authenticated AGENT can create routes for itself only.
 */
export default function RouteSelfPlanningWorkspace({
  onClose,
  initialDate,
  initialHorizon,
}: {
  onClose?: () => void
  initialDate?: string
  initialHorizon?: PlanningHorizon
}) {
  const mayPlanOwnRoutes = useBootstrapStore((state) => state.data?.policies.canPlanOwnRoutes === true)
  const currentAgent = useAuthStore((state) => state.agent)

  const agentSource = useMemo<PlanningWorkspaceAgentSource>(() => {
    if (
      !mayPlanOwnRoutes ||
      !currentAgent?.id ||
      String(currentAgent.role).toUpperCase() !== "AGENT"
    ) {
      return { kind: "self", agent: null }
    }
    return {
      kind: "self",
      agent: {
        id: currentAgent.id,
        name: currentAgent.name || "—",
        role: "AGENT",
      },
    }
  }, [currentAgent?.id, currentAgent?.name, currentAgent?.role, mayPlanOwnRoutes])

  return (
    <PlanningWorkspaceCore
      onClose={onClose}
      agentSource={agentSource}
      initialDate={initialDate}
      initialHorizon={initialHorizon}
    />
  )
}
