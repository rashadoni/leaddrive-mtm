import { toPresentationCatalog, visitTimeStatus } from "../../src/services/product-presentations"

describe("product presentation catalog", () => {
  it("keeps valid group hierarchy and approved presentation files", () => {
    expect(toPresentationCatalog({
      groups: [
        { id: "g-root", parentId: null, name: "Cardiology" },
        { id: "g-child", parentId: "g-root", name: "Hypertension" },
      ],
      products: [{
        id: "p-1",
        groupId: "g-child",
        name: "Product A",
        description: "Approved deck",
        presentationVersion: "3",
        downloadUrl: "/api/v1/mtm/mobile/documents/d-1/download?view=inline",
        document: {
          id: "d-1",
          title: "Product A deck",
          fileName: "product-a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: "a".repeat(64),
        },
      }],
    })).toEqual({
      groups: [
        { id: "g-root", parentId: null, name: "Cardiology" },
        { id: "g-child", parentId: "g-root", name: "Hypertension" },
      ],
      products: [{
        id: "p-1",
        groupId: "g-child",
        name: "Product A",
        description: "Approved deck",
        presentationVersion: "3",
        downloadUrl: "/api/v1/mtm/mobile/documents/d-1/download?view=inline",
        document: {
          id: "d-1",
          title: "Product A deck",
          fileName: "product-a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: "a".repeat(64),
        },
      }],
    })
  })

  it("drops malformed groups and products without an accessible document", () => {
    const result = toPresentationCatalog({
      groups: [{ id: "", name: "Broken" }, { id: "g-1", name: "Valid" }],
      products: [
        { id: "p-1", groupId: "g-1", name: "No document", downloadUrl: "/download" },
        { id: "p-2", groupId: "g-1", name: "No URL", document: { id: "d-2", fileName: "a.pdf", mimeType: "application/pdf" } },
      ],
    })
    expect(result.groups).toEqual([{ id: "g-1", parentId: null, name: "Valid" }])
    expect(result.products).toEqual([])
  })
})

describe("recommended visit duration", () => {
  const started = "2026-09-19T10:00:00.000Z"

  it.each([
    [24, "normal"],
    [25, "warning"],
    [29, "warning"],
    [30, "overtime"],
    [45, "overtime"],
  ] as const)("returns %s minutes as %s", (minutes, expected) => {
    expect(visitTimeStatus(started, Date.parse(started) + minutes * 60_000)).toBe(expected)
  })

  it("does not invent overtime when the visit start is absent or invalid", () => {
    expect(visitTimeStatus(undefined)).toBe("normal")
    expect(visitTimeStatus("not-a-date")).toBe("normal")
  })
})
