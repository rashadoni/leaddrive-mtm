let activeScope: string | null = null

export function offlineScopeKey(tenantId?: string | null, userId?: string | null): string | null {
  if (!tenantId || !userId) return null
  return `${tenantId}:${userId}`
}

export function setOfflineScope(tenantId?: string | null, userId?: string | null) {
  activeScope = offlineScopeKey(tenantId, userId)
  return activeScope
}

export function clearOfflineScope() {
  activeScope = null
}

export function getOfflineScope(): string | null {
  return activeScope
}

export function requireOfflineScope(): string {
  if (!activeScope) throw new Error("OFFLINE_SCOPE_NOT_SET")
  return activeScope
}
