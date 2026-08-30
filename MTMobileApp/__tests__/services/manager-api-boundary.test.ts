import fs from "fs"
import path from "path"

const coreApiSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/services/api.ts"),
  "utf8",
)
const managerApiSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/services/manager-api.ts"),
  "utf8",
)

describe("legacy manager API boundary", () => {
  it("keeps manager/team endpoint literals out of the Route Field core client", () => {
    const managerOnlyEndpoints = [
      "/mobile/manager/",
      "/operations/hrm/",
      "/route-change-requests/",
      "/customer-create-requests/",
      "/contact-change-requests/",
      "/mobile/tasks/bulk-reassign",
      "/mobile/team-schedule",
      "mode: \"SELF_SHARE\"",
      "/organizations/facets",
      "/organizations/views",
      "/organization-assignments/preview",
      "/organization-assignments",
      "managingManagerId",
      "assignedAgentId",
      "assignmentState",
    ]

    for (const endpoint of managerOnlyEndpoints) {
      expect(coreApiSource).not.toContain(endpoint)
      expect(managerApiSource).toContain(endpoint)
    }
  })

  it("uses the shared authenticated transport without changing server contracts", () => {
    expect(managerApiSource).toContain('import { api } from "./api"')
    expect(managerApiSource).toContain("api.requestLegacy")
  })
})
