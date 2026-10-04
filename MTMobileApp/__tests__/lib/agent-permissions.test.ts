import fs from "fs"
import path from "path"
import {
  AGENT_PERMISSION_DISABLED_CODE,
  agentMay,
  isAgentPermissionDisabled,
  parseAgentPermissions,
} from "../../src/lib/agent-permissions"

/**
 * The web matrix "what an agent may do" lets an organization switch agent
 * functions off; the bootstrap carries the switches as
 * `policies.agentPermissions`. The app hides the way in — the server refuses
 * on its own.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

describe("parseAgentPermissions", () => {
  it("keeps boolean answers and drops the rest", () => {
    expect(parseAgentPermissions({ contactCreateRequest: false, taskSelfCreate: true, odd: "false", n: 0 }))
      .toEqual({ contactCreateRequest: false, taskSelfCreate: true })
  })

  it("has no answer for a missing map or junk, so nothing gets hidden", () => {
    expect(parseAgentPermissions(undefined)).toBeUndefined()
    expect(parseAgentPermissions(null)).toBeUndefined()
    expect(parseAgentPermissions("contactCreateRequest")).toBeUndefined()
    expect(parseAgentPermissions([false])).toBeUndefined()
    expect(parseAgentPermissions({})).toBeUndefined()
    expect(parseAgentPermissions({ contactCreateRequest: "false" })).toBeUndefined()
  })
})

describe("agentMay", () => {
  it("shows a function when the answer is missing (older server, cached bootstrap)", () => {
    expect(agentMay(undefined, "contactCreateRequest")).toBe(true)
    expect(agentMay(null, "contactCreateRequest")).toBe(true)
    expect(agentMay({}, "contactCreateRequest")).toBe(true)
    expect(agentMay({ agentPermissions: {} }, "contactCreateRequest")).toBe(true)
    // A server that knows other switches but not this one.
    expect(agentMay({ agentPermissions: { taskSelfCreate: false } }, "contactCreateRequest")).toBe(true)
  })

  it("hides it only on an explicit false", () => {
    expect(agentMay({ agentPermissions: { contactCreateRequest: true } }, "contactCreateRequest")).toBe(true)
    expect(agentMay({ agentPermissions: { contactCreateRequest: false } }, "contactCreateRequest")).toBe(false)
  })
})

describe("isAgentPermissionDisabled", () => {
  it("recognises the server's refusal by its code", () => {
    const refusal = Object.assign(new Error("The organization has switched this function off"), {
      code: AGENT_PERMISSION_DISABLED_CODE,
      status: 403,
    })
    expect(isAgentPermissionDisabled(refusal)).toBe(true)
    expect(isAgentPermissionDisabled({ code: "MTM_AGENT_PERMISSION_DISABLED" })).toBe(true)
  })

  it("is not fooled by other failures", () => {
    expect(isAgentPermissionDisabled(new Error("SESSION_EXPIRED"))).toBe(false)
    expect(isAgentPermissionDisabled({ code: "MTM_ROUTE_FIELD_AGENT_REQUIRED" })).toBe(false)
    expect(isAgentPermissionDisabled(undefined)).toBe(false)
    expect(isAgentPermissionDisabled("MTM_AGENT_PERMISSION_DISABLED")).toBe(false)
  })
})

describe("the request for a new doctor follows the organization's switch", () => {
  const list = read("screens/base/RouteContactsList.android.tsx")
  const form = read("screens/base/DoctorCreateRequestScreen.tsx")

  it("reads the switch through the tolerant helper", () => {
    expect(list).toContain('import { agentMay } from "../../lib/agent-permissions"')
    expect(list).toContain('const canRequestDoctor = useBootstrapStore((state) => agentMay(state.data?.policies, "contactCreateRequest"))')
  })

  it("has one way into the request, and it is behind the switch", () => {
    expect(list.split('navigation.navigate("DoctorCreateRequest")').length - 1).toBe(1)
    const from = list.indexOf("{canRequestDoctor ? (")
    const to = list.indexOf(") : null}", from)
    expect(from).toBeGreaterThan(-1)
    expect(list.slice(from, to)).toContain('navigation.navigate("DoctorCreateRequest")')
    expect(list.slice(from, to)).toContain("copy.addDoctor")
  })

  it("keeps the requests already sent on the screen", () => {
    const from = list.indexOf("{canRequestDoctor ? (")
    const to = list.indexOf(") : null}", from)
    expect(list.slice(from, to)).not.toContain("shownRequests")
    expect(list.slice(to)).toContain("shownRequests.length > 0")
  })

  it("tells the agent in their own language when the server refuses", () => {
    expect(form).toContain("setError(isAgentPermissionDisabled(submitError) ? copy.disabled : technical ? copy.failed : message)")
    // One sentence per language the screen speaks.
    expect(form.split('disabled: "').length - 1).toBe(3)
  })
})
