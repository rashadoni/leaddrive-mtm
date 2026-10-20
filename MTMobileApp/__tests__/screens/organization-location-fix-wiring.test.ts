import fs from "fs"
import path from "path"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import { buildLocationFixMapDocument } from "../../src/screens/base/organization-location-fix-map"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const navigator = read("src/navigation/AppNavigatorAndroidV2.tsx")
const card = read("src/screens/base/RouteOrganizationDetailScreen.android.tsx")
const screen = read("src/screens/base/RouteOrganizationLocationFixScreen.android.tsx")
const visit = read("src/screens/visit/VisitScreen.tsx")
const api = read("src/services/api.ts")
const route = read("src/screens/route/RouteScreen.tsx")
const runtime = read("src/runtime/AndroidApp.tsx")
const store = read("src/store/location-fixes.ts")

/**
 * «Клиент здесь» is several pieces that only work together: a screen that is
 * registered where it is opened from, an offer on the card that leads to it,
 * and requests that go to the door the server opened. The pure rules have
 * their own test; this holds the joints.
 */
describe("«Клиент здесь» is reachable", () => {
  it("is a screen of both stacks it is opened from", () => {
    expect(navigator).toContain('import RouteOrganizationLocationFixScreen from "../screens/base/RouteOrganizationLocationFixScreen.android"')
    expect(navigator.match(/OrganizationLocationFix: \{ id: string; name\?: string; latitude\?: number; longitude\?: number \}/g)).toHaveLength(2)
    expect(navigator).toContain('<ClientsStack.Screen name="OrganizationLocationFix" component={withFieldColorScheme(RouteOrganizationLocationFixScreen)} />')
    expect(navigator).toContain('<Stack.Screen name="OrganizationLocationFix" component={withFieldColorScheme(RouteOrganizationLocationFixScreen)} />')
  })

  it("is offered on the customer's card only where the organization lets its agents ask", () => {
    expect(card).toContain('agentMay(state.data?.policies, "customerLocationRequest")')
    expect(card).toContain('navigation.navigate("OrganizationLocationFix", {')
    // «No pin» is read only from a server that says so.
    expect(card).toContain("(!pin && !detail.pinReported)")
    // The card comes back from the map already saying «на проверке».
    expect(card).toContain('navigation.addListener("focus", () => {')
    expect(card).toContain("const request = toLocationFixRequest(response.data.locationRequest)")
    expect(card).toContain("setLocationRequest(request)")
  })

  it("is offered where a check-in was refused for the distance or for a missing pin", () => {
    expect(visit).toContain('(checkInIssue.kind === "too-far" || checkInIssue.kind === "no-coordinates") && fixLocationLabel ? (')
    // Null where the organization switched the request off: the button is then not drawn.
    expect(visit).toContain('fixLocationLabel: selectedCustomer && mayFixLocation() ? t("visit.customerIsHere") : null,')
    expect(visit).toContain("onFixLocation: () => { if (selectedCustomer) openLocationFix(selectedCustomer) },")
    expect(visit).toContain('confirmText: t("visit.customerIsHere")')
    expect(visit).toContain("onConfirm: () => openLocationFix(customer)")
    // Without the permission the older way stays: tell the manager.
    expect(visit).toContain("onConfirm: () => reportMissingCoordinates(customer)")
  })

  it("has its words in every language", () => {
    for (const locale of [ru, az, en] as unknown as Array<{ visit: Record<string, string> }>) {
      expect(locale.visit.customerIsHere.length).toBeGreaterThan(5)
      expect(locale.visit.noCoordinatesFixBody).toContain("{{name}}")
    }
  })
})

describe("«Клиент здесь» goes to the door the server opened", () => {
  it("sends and withdraws on the organization's own path, through the v2 mobile API", () => {
    const send = api.slice(api.indexOf("async submitOrganizationLocationRequest("), api.indexOf("async cancelOrganizationLocationRequest("))
    expect(send).toContain("`/mobile/route-field/organizations/${encodeURIComponent(id)}/location-request`")
    expect(send).toContain('method: "POST"')
    expect(send).toContain("}, 20_000, 2)")
    const cancel = api.slice(api.indexOf("async cancelOrganizationLocationRequest("), api.indexOf("async getRouteContacts("))
    expect(cancel).toContain("`/mobile/route-field/organizations/${encodeURIComponent(id)}/location-request`")
    expect(cancel).toContain('method: "DELETE"')
  })

  it("does not send what cannot be taken, and says why under the map", () => {
    expect(screen).toContain("const problem = locationFixProblem(pin, fix, current, now)")
    expect(screen).toContain("if (!pin || !fix || problem || sending) return")
    expect(screen).toContain("const canSend = !problem && !sending && !locating")
    expect(screen).toContain("locationFixPayload(idempotencyKey.current, pin, fix, comment, Date.now())")
  })
})

describe("the map of «Клиент здесь»", () => {
  const labels = {
    loading: "Загружаем", unavailable: "Нет карты", attribution: "© OpenStreetMap © CARTO",
    here: "Клиент <здесь> & \"тут\"", current: "Сейчас в базе", zoomIn: "Ближе", zoomOut: "Дальше",
  }
  const agent = { latitude: 40.41, longitude: 49.85, accuracy: 12 }
  const page = buildLocationFixMapDocument({ center: agent, agent, current: { latitude: 40.4, longitude: 49.85 } }, labels, { apiKey: "k-1" })

  it("keeps the pin in the middle and moves the map under it", () => {
    expect(page).toContain("#here-pin { left: 50%; top: 50%;")
    expect(page).toContain('map.addEventListener("pointerdown"')
    expect(page).toContain("state.center = place(middle.x - moved.dx, middle.y - moved.dy);")
  })

  it("tells the app where its middle is, and lets the app move it", () => {
    expect(page).toContain('post({ type: "center", latitude: state.center.latitude, longitude: state.center.longitude });')
    expect(page).toContain("window.__setCenter = function (latitude, longitude)")
    expect(page).toContain("window.__setAgent = function (latitude, longitude, accuracy)")
  })

  it("draws how far from himself the agent may put the pin — the server's own limit", () => {
    expect(page).toContain('"limit":150')
    expect(page).toContain('put("agent-limit", state.agent, 2 * state.limit / scale);')
  })

  it("writes a label as text, never as markup", () => {
    expect(page).toContain("Клиент &lt;здесь&gt; &amp; &quot;тут&quot;")
    expect(page).not.toContain("Клиент <здесь>")
  })

  it("asks CARTO with the key the server gave", () => {
    expect(page).toContain('"?key=k-1"')
  })

  it("starts without a pin on file for a customer that has none", () => {
    const first = buildLocationFixMapDocument({ center: agent, agent, current: null }, labels)
    expect(first).toContain('"current":null')
  })
})

/**
 * While the request waits (owner, 12 October 2026: «пускать, но показывать
 * руководителю такой визит с пометкой "адрес на проверке"»). The server lets
 * the reporter in from the place he reported; these are the joints that keep
 * the app from stopping him before the server is asked — and from letting
 * anybody else lean on his request.
 */
describe("a visit from the reported place, while the request waits", () => {
  it("remembers the place when the request goes out, and what the server says about it afterwards", () => {
    expect(screen).toContain("useLocationFixStore.getState().remember(id, pin)")
    // The card is told by the server whether this agent's request still waits.
    expect(card).toContain('if (request?.mine && request.status === "SUBMITTED" && request.proposed) useLocationFixStore.getState().remember(id, request.proposed)')
    expect(card).toContain("else useLocationFixStore.getState().forget(id)")
    expect(card).toContain("useLocationFixStore.getState().forget(detail.id)")
  })

  it("keeps the memory across restarts, and to the agent it belongs to", () => {
    expect(runtime).toContain("useLocationFixStore.getState().hydrate().catch(() => {})")
    expect(store).toContain("const agentId = useAuthStore.getState().agent?.id")
    expect(store).toContain("waitingLocationFixOf(useLocationFixStore.getState().fixes, useAuthStore.getState().agent?.id, customerId, Date.now())")
  })

  it("does not stop him on the visit screen: at the reported place he is measured against it", () => {
    const flow = visit.slice(visit.indexOf("const performCheckIn"), visit.indexOf("const { visit, operation } = await queueVisitCheckIn({"))
    expect(flow).toContain("const waitingFix = waitingLocationFixFor(customer.id)")
    expect(flow).toContain("if (!hasUsableCoordinates(customer) && !waitingFix) {")
    expect(flow).toContain("const leaning = locationFixCoversCheckIn(waitingFix, coords, checkInRadiusMeters(null, useBootstrapStore.getState().data?.policies))")
    // Not at the reported place, and the customer has no pin: refused as it always was.
    expect(flow).toContain("if (!leaning && !hasUsableCoordinates(customer)) {")
    expect(flow).toContain("customer: leaning && waitingFix ? { ...customer, latitude: waitingFix.latitude, longitude: waitingFix.longitude } : customer,")
  })

  it("does not stop him on the route screen either", () => {
    const flow = route.slice(route.indexOf("const handleCheckIn = async (point: RoutePoint) => {"), route.indexOf("let forceCheckIn = false", route.indexOf("const handleCheckIn = async (point: RoutePoint) => {")))
    expect(flow).toContain("const waitingFix = waitingLocationFixFor(point.customer.id)")
    expect(flow).toContain("if (!hasUsableCoordinates(point.customer) && !waitingFix) {")
    expect(flow).toContain("const leaning = locationFixCoversCheckIn(waitingFix, coords, pointCheckInRadius(point))")
    expect(flow).toContain("const customerCoordinates = leaning && waitingFix")
  })

  it("forgets the place when the server refuses a check-in there: the request waits no longer", () => {
    const outcomes = visit.slice(visit.indexOf("const explainCheckInOutcome"), visit.indexOf('case "active_visit":'))
    expect(outcomes.match(/useLocationFixStore\.getState\(\)\.forget\(customer\.id\)/g)).toHaveLength(2)
  })

  it("sends no «force» because of it: the server decides, and marks the visit for a manager", () => {
    const flow = visit.slice(visit.indexOf("const leaning = "), visit.indexOf("const { visit, operation } = await queueVisitCheckIn({"))
    expect(flow).not.toMatch(/forceCheckIn = true/)
    expect(flow).not.toMatch(/leaning[^\n]*forceCheckIn/)
  })
})
