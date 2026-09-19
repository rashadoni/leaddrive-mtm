export interface MobileProductGroup {
  id: string
  parentId: string | null
  name: string
}

export interface MobileProductPresentation {
  id: string
  groupId: string
  name: string
  description?: string
  presentationVersion?: string
  downloadUrl: string
  document: {
    id: string
    title?: string
    fileName: string
    mimeType: string
    sizeBytes: number
  }
}

export interface PresentationCatalog {
  groups: MobileProductGroup[]
  products: MobileProductPresentation[]
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function toPresentationCatalog(raw: any): PresentationCatalog {
  const groups = Array.isArray(raw?.groups) ? raw.groups : []
  const products = Array.isArray(raw?.products) ? raw.products : []
  return {
    groups: groups.flatMap((group: any) => {
      const id = text(group?.id)
      const name = text(group?.name)
      if (!id || !name) return []
      return [{ id, parentId: text(group?.parentId) ?? null, name }]
    }),
    products: products.flatMap((product: any) => {
      const id = text(product?.id)
      const groupId = text(product?.groupId)
      const name = text(product?.name)
      const downloadUrl = text(product?.downloadUrl)
      const documentId = text(product?.document?.id)
      const fileName = text(product?.document?.fileName)
      const mimeType = text(product?.document?.mimeType)
      if (!id || !groupId || !name || !downloadUrl || !documentId || !fileName || !mimeType) return []
      return [{
        id,
        groupId,
        name,
        description: text(product?.description),
        presentationVersion: text(product?.presentationVersion),
        downloadUrl,
        document: {
          id: documentId,
          title: text(product?.document?.title),
          fileName,
          mimeType,
          sizeBytes: Number(product?.document?.sizeBytes) || 0,
        },
      }]
    }),
  }
}

export function visitTimeStatus(checkInAt: string | undefined, now = Date.now()): "normal" | "warning" | "overtime" {
  const started = checkInAt ? new Date(checkInAt).getTime() : Number.NaN
  if (!Number.isFinite(started)) return "normal"
  const minutes = Math.max(0, Math.floor((now - started) / 60_000))
  if (minutes >= 30) return "overtime"
  if (minutes >= 25) return "warning"
  return "normal"
}
