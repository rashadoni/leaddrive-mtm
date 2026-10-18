/**
 * The first-run guide (owner, 2026-10-18: «пошаговый гид как в играх — для
 * чего, куда нажимать, максимально интерактивно»; mockup approved the same day).
 *
 * A step lives on one screen and lights one real control there:
 * - `look` explains it; the control itself is covered, so «Günə başla» or a
 *   check-in is never pressed by the tour. «Növbəti» goes on.
 * - `tap` waits for a real press: the step is done when the press opens its
 *   `goal` screen, and the guide goes on by itself.
 *
 * Everything here is plain data and arithmetic, so the order of the tour and
 * where its bubble stands are tested without a phone.
 */

export type GuideTourId = "field" | "manager"

export type GuideStep = {
  /** Also the i18n key: `guide.<tour>.<id>.title|body|tap`. */
  id: string
  kind: "look" | "tap"
  /** The focused route the step lives on (the navigator's deepest route name). */
  screen: string
  /** The GuideSpot that marks the control on that screen. */
  spot: string
  /** For a tap: the route the real press opens. */
  goal?: string
  /** How many numbered lines the bubble lists under the body (`…line1`, `…line2`). */
  lines?: number
}

/** Field agent: «Bu gün» → start the day → route → a visit → tasks → the bell → «Daha çox». */
const FIELD: GuideStep[] = [
  { id: "workday", kind: "look", screen: "Today", spot: "today.workday" },
  { id: "routeTab", kind: "tap", screen: "Today", spot: "tab.Route", goal: "Route" },
  { id: "visit", kind: "look", screen: "Route", spot: "route.first", lines: 3 },
  { id: "tasksTab", kind: "tap", screen: "Route", spot: "tab.Tasks", goal: "Tasks" },
  { id: "bell", kind: "tap", screen: "Tasks", spot: "bell", goal: "Notifications" },
  { id: "feed", kind: "look", screen: "Notifications", spot: "feed.actions" },
  { id: "moreTab", kind: "tap", screen: "Tasks", spot: "tab.More", goal: "MoreHome" },
  { id: "again", kind: "look", screen: "MoreHome", spot: "more.guide" },
]

/** Manager: «Komanda» → «Təsdiqlər» → «Planlama» → «Komandaya yaz» → the bell. */
const MANAGER: GuideStep[] = [
  { id: "tiles", kind: "look", screen: "Team", spot: "team.tiles" },
  { id: "writeTeam", kind: "look", screen: "Team", spot: "team.write" },
  { id: "approvalsTab", kind: "tap", screen: "Team", spot: "tab.Approvals", goal: "Approvals" },
  { id: "approvals", kind: "look", screen: "Approvals", spot: "approvals.first" },
  { id: "planningTab", kind: "tap", screen: "Approvals", spot: "tab.Planning", goal: "Planning" },
  { id: "createRoute", kind: "look", screen: "Planning", spot: "planning.create" },
  { id: "bell", kind: "tap", screen: "Planning", spot: "bell", goal: "Notifications" },
  { id: "feed", kind: "look", screen: "Notifications", spot: "feed.actions" },
  { id: "moreTab", kind: "tap", screen: "Planning", spot: "tab.More", goal: "More" },
  { id: "again", kind: "look", screen: "More", spot: "profile.guide" },
]

export const GUIDE_TOURS: Record<GuideTourId, readonly GuideStep[]> = { field: FIELD, manager: MANAGER }

/** The tab a tour opens on, and the one its welcome card stands over. */
export const GUIDE_HOME: Record<GuideTourId, string> = { field: "Today", manager: "Team" }

/** The places the welcome card names, in the order the tour visits them (i18n keys). */
export const GUIDE_PATH: Record<GuideTourId, readonly string[]> = {
  field: ["navV2.today", "navV2.route", "guide.pathVisit", "navV2.tasks", "guide.pathBell", "navV2.more"],
  manager: ["navV2.team", "navV2.approvals", "navV2.planning", "managerShell.writeTeam", "guide.pathBell", "navV2.more"],
}

/** Which tour a shell gets. The office shell and the blocked screen get none. */
export function guideTourForShell(kind: string | null | undefined): GuideTourId | null {
  if (kind === "field") return "field"
  if (kind === "manager") return "manager"
  return null
}

export function guideStep(tour: GuideTourId, index: number): GuideStep | null {
  return index >= 0 ? GUIDE_TOURS[tour][index] ?? null : null
}

/** A tap step is done when its real press opened the goal. */
export function guideStepDone(step: GuideStep, route: string | null): boolean {
  return step.kind === "tap" && !!step.goal && route === step.goal
}

export type GuideNavigation = { name: string; params?: Record<string, unknown>; pop?: boolean }

/**
 * How the guide itself reaches a screen: when a step starts somewhere else
 * (the tour opened from «Daha çox», «Növbəti» under the bell's list), or when
 * a tap step's control could not be found and «Növbəti» does its press.
 *
 * Tabs are reached by going back to the tabs: React Navigation 7 reuses a
 * route on NAVIGATE only with `pop`, and from the list over the tabs a plain
 * navigate("Main", …) put a second set of tabs on the stack (#151).
 */
export function guideNavigation(screen: string): GuideNavigation {
  if (screen === "Notifications") return { name: "Notifications" }
  if (screen === "MoreHome") return { name: "Main", params: { screen: "More", params: { screen: "MoreHome", pop: true } }, pop: true }
  return { name: "Main", params: { screen }, pop: true }
}

/** The deepest focused route of a navigation state, the way the navigator ref reports it. */
export function focusedRouteName(state: unknown): string | null {
  let node = state as { index?: number; routes?: Array<{ name: string; state?: unknown }> } | undefined
  let name: string | null = null
  while (node && Array.isArray(node.routes) && node.routes.length > 0) {
    const route = node.routes[typeof node.index === "number" ? node.index : node.routes.length - 1]
    if (!route) break
    name = route.name
    node = route.state as typeof node
  }
  return name
}

export type GuideRect = { x: number; y: number; width: number; height: number }

/** A control the guide can point at: measured, of some size, and on the screen. */
export function guideRectVisible(rect: GuideRect | null | undefined, frame: { width: number; height: number }): rect is GuideRect {
  if (!rect) return false
  if (!(rect.width > 2 && rect.height > 2)) return false
  return rect.y < frame.height && rect.y + rect.height > 0 && rect.x < frame.width && rect.x + rect.width > 0
}

export type GuideBubblePlacement = {
  side: "below" | "above" | "center"
  /** Distance from the top of the frame (below / center). */
  top?: number
  /** Distance from the bottom of the frame (above). */
  bottom?: number
  left: number
  width: number
  /** Where the arrow points, from the bubble's left edge. */
  arrowX: number
}

export const GUIDE_BUBBLE_GAP = 14
export const GUIDE_BUBBLE_MAX_WIDTH = 440
const EDGE = 14
/** About the height of a bubble with a one-line title, three lines of text and its buttons. */
export const GUIDE_BUBBLE_HEIGHT = 230

/**
 * Where the bubble stands: under the control when the room under it is the
 * larger, otherwise over it, so a bubble never covers what it talks about.
 * A control taller than the screen leaves no room either way: the bubble then
 * sits at the bottom over the control, which is only looked at.
 */
export function guideBubblePlacement(
  hole: GuideRect | null,
  frame: { width: number; height: number; top: number; bottom: number },
  bubbleHeight = GUIDE_BUBBLE_HEIGHT,
): GuideBubblePlacement {
  const width = Math.min(GUIDE_BUBBLE_MAX_WIDTH, frame.width - EDGE * 2)
  if (!hole) {
    const left = (frame.width - width) / 2
    return { side: "center", top: Math.max(frame.top + EDGE, (frame.height - bubbleHeight) / 2), left, width, arrowX: width / 2 }
  }
  const centerX = hole.x + hole.width / 2
  const left = Math.min(Math.max(EDGE, centerX - width / 2), frame.width - EDGE - width)
  const arrowX = Math.min(Math.max(24, centerX - left), width - 24)
  const roomBelow = frame.height - frame.bottom - (hole.y + hole.height)
  const roomAbove = hole.y - frame.top
  if (roomBelow >= roomAbove && roomBelow >= bubbleHeight + GUIDE_BUBBLE_GAP) {
    return { side: "below", top: hole.y + hole.height + GUIDE_BUBBLE_GAP, left, width, arrowX }
  }
  if (roomAbove >= bubbleHeight + GUIDE_BUBBLE_GAP) {
    return { side: "above", bottom: frame.height - hole.y + GUIDE_BUBBLE_GAP, left, width, arrowX }
  }
  return { side: "center", bottom: frame.bottom + EDGE, left, width, arrowX: width / 2 }
}
