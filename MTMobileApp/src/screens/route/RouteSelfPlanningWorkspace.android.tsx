import React, { useCallback, useMemo } from "react"
import PlanningWorkspaceCore, {
  type PlanningWorkspaceAgentSource,
  type PlanningWorkspaceTargetSource,
  type PlanningWorkspaceWriteSource,
} from "../planning/PlanningWorkspaceCore.android"
import { useBootstrapStore } from "../../store/bootstrap"
import { useAuthStore } from "../../store/auth"
import type { PlanningHorizon, PlanningTarget } from "../../services/manager-planning"
import { api } from "../../services/api"
import { toRoutePlanningTarget } from "../../services/route-planning-target"
import { submitRouteCommand } from "../../services/route-command-journal"

/**
 * Route Field's only planning entry point. It never receives a team ID or a
 * manager loader: the authenticated AGENT can create routes for itself only.
 */
export default function RouteSelfPlanningWorkspace({
  onClose,
  onPublished,
  initialDate,
  initialHorizon,
}: {
  onClose?: () => void
  onPublished?: () => void
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

  const loadTargets = useCallback<PlanningWorkspaceTargetSource["loadTargets"]>(async (query, signal) => {
    // The server intentionally returns contact candidates in disjoint direct
    // and customer-assignment phases. Follow at most one empty continuation so
    // an agent with only customer-owned doctors does not see a false empty
    // state, while preserving bounded foreground work and server-issued cursor
    // semantics for every further page.
    let page = query.continuation ?? undefined
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await api.getRoutePlanningTargets({
        kind: query.kind,
        date: query.date,
        search: query.search,
        page,
        limit: 25,
        ...(query.kind === "organization" ? {
          objectType: query.objectType,
          organizationKind: query.organizationKind,
        } : {}),
      }, signal)
      if (!response?.success) throw new Error(response?.error || "ROUTE_PLANNING_TARGETS_UNAVAILABLE")
      // This response is already guarded by AbortController/request sequencing
      // in the shared workspace. Verify the echoed date as a second boundary:
      // a stale or incorrectly cached response must never become a target
      // eligible for the date the agent is currently planning.
      if (response?.data?.date !== query.date) throw new Error("ROUTE_PLANNING_TARGETS_DATE_MISMATCH")
      const rawTargets: unknown[] = Array.isArray(response?.data?.targets) ? response.data.targets : []
      const targets = rawTargets
        .map((target) => toRoutePlanningTarget(target, query.date))
        .filter((target): target is PlanningTarget => target !== null)
      const nextPage = typeof response?.data?.nextPage === "string" && response.data.nextPage
        ? response.data.nextPage
        : null
      if (targets.length > 0 || !nextPage || attempt === 1) return { targets, nextPage }
      page = nextPage
    }
    return { targets: [], nextPage: null }
  }, [])

  const targetSource = useMemo<PlanningWorkspaceTargetSource>(() => ({ loadTargets }), [loadTargets])

  const writeSource = useMemo<PlanningWorkspaceWriteSource>(() => ({
    saveDraft: async ({ date, routeId, expectedVersion, points }) => {
      // The self planner never transports an agent ID. The backend derives
      // actor/tenant/route scope from the mobile JWT and durable receipt.
      const response = routeId
        ? await submitRouteCommand({
            command: "UPDATE_DRAFT",
            routeId,
            payload: { expectedVersion: expectedVersion!, points },
          }, (request) => api.executeRouteCommand(request))
        : await submitRouteCommand({
            command: "CREATE_DRAFT",
            payload: { date, points },
          }, (request) => api.executeRouteCommand(request))
      return { routeId: response.data.id, version: response.data.version }
    },
    publishDraft: async ({ routeId, expectedVersion }) => {
      await submitRouteCommand({
        command: "PUBLISH",
        routeId,
        payload: { expectedVersion },
      }, (request) => api.executeRouteCommand(request))
    },
  }), [])

  return (
    <PlanningWorkspaceCore
      onClose={onClose}
      onPublished={onPublished}
      agentSource={agentSource}
      targetSource={targetSource}
      writeSource={writeSource}
      initialDate={initialDate}
      initialHorizon={initialHorizon}
    />
  )
}
