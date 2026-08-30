import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { useWorkdayStore, workdayKey } from "../store/workday"
import { hasRouteFieldAccess, isConfirmedRouteFieldWithdrawal, type RouteFieldAccess } from "./bootstrap"
import { runMobileSync, withdrawRouteFieldV2ShadowState } from "./sync-engine"

/**
 * Refresh the one field-session authority shared by the Route Field home and
 * the Android runtime. The local workday row is only a durable outbox/UI
 * projection: bootstrap is the server authority and is reconciled before and
 * after a sync attempt. This keeps a pending START from unlocking either route
 * execution or GPS, while retaining that outbox operation for retry.
 */
export async function refreshRouteFieldSession(): Promise<RouteFieldAccess> {
  const auth = useAuthStore.getState()
  if (!auth.isLoggedIn || !auth.agent) return "unavailable"

  const key = workdayKey(auth.agent.organizationId, auth.agent.id)
  await useWorkdayStore.getState().hydrate()

  const reconcile = async () => {
    const bootstrap = useBootstrapStore.getState().data
    await useWorkdayStore.getState().reconcileFromServer(key, bootstrap?.workday)
  }

  let access = await useBootstrapStore.getState().fetchBootstrap()
  if (!hasRouteFieldAccess(access)) {
    const bootstrap = useBootstrapStore.getState().data
    if (isConfirmedRouteFieldWithdrawal(bootstrap, access)) {
      await withdrawRouteFieldV2ShadowState({
        tenantId: auth.agent.organizationId,
        agentId: auth.agent.id,
        reason: access === "disabled"
          ? "TENANT_CAPABILITY_DISABLED"
          : "ROUTE_FIELD_ADMISSION_UNAVAILABLE",
      })
    }
    return access
  }

  // Adopt a server-started session (another device / restored install) before
  // draining the local queue. No mutable authority changes hands here.
  await reconcile()
  await runMobileSync()

  // A queued START/FINISH is not confirmed by a successful HTTP push alone:
  // read bootstrap again so UI and GPS use the canonical post-transaction row.
  access = await useBootstrapStore.getState().fetchBootstrap()
  if (hasRouteFieldAccess(access)) {
    await reconcile()
    return access
  }

  const bootstrap = useBootstrapStore.getState().data
  if (isConfirmedRouteFieldWithdrawal(bootstrap, access)) {
    await withdrawRouteFieldV2ShadowState({
      tenantId: auth.agent.organizationId,
      agentId: auth.agent.id,
      reason: access === "disabled"
        ? "TENANT_CAPABILITY_DISABLED"
        : "ROUTE_FIELD_ADMISSION_UNAVAILABLE",
    })
  }
  return access
}
