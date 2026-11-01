/**
 * The opening of the app, as the owner chose it (2026-11-01, mockup «C2,
 * фирменный зелёный», then «тёмно-зелёный» — the green of the app's status
 * bar, not the lighter one of the mockup): a city map in the app's green draws itself — streets,
 * blocks, a park, the river — the clients' pins drop onto it, a dashed route
 * joins them, the last pin pulses, the map steps back and the name comes up.
 *
 * Everything is drawn in a 258 × 468 frame (the mockup's phone) and scaled to
 * the screen by the component; times are milliseconds from the start.
 */

export const SCENE_WIDTH = 258
export const SCENE_HEIGHT = 468

export const SPLASH_COLORS = {
  ground: "#055342",
  river: "#04443A",
  park: "#0A6A52",
  block: "#064B3D",
  street: "#1D7560",
  lane: "#0F6450",
  route: "#FFFFFF",
  pin: "#FFFFFF",
  lastPin: "#FAC775",
  title: "#FFFFFF",
  tagline: "#C9EFE1",
} as const

export type Point = { x: number; y: number }
export type Segment = { from: Point; to: Point }

export interface SceneLine extends Segment {
  thickness: number
  color: string
  delay: number
  duration: number
}

export interface SceneRect {
  x: number
  y: number
  width: number
  height: number
  radius: number
  color: string
  delay: number
  /** Degrees; the river is a tilted band. */
  rotate?: number
}

export interface ScenePin extends Point {
  color: string
  delay: number
}

export const BLOCKS: SceneRect[] = [
  { x: -40, y: 352, width: 340, height: 170, radius: 85, color: SPLASH_COLORS.river, delay: 0, rotate: -4 },
  { x: 95, y: 150, width: 70, height: 80, radius: 10, color: SPLASH_COLORS.park, delay: 200 },
  ...[
    [10, 20, 50, 80],
    [100, 20, 70, 70],
    [225, 30, 40, 60],
    [225, 150, 40, 90],
    [10, 170, 40, 60],
    [100, 290, 70, 30],
  ].map(([x, y, width, height]) => ({ x, y, width, height, radius: 4, color: SPLASH_COLORS.block, delay: 100 })),
]

const street = (from: Point, to: Point, delay: number): SceneLine => ({ from, to, thickness: 9, color: SPLASH_COLORS.street, delay, duration: 1200 })
const lane = (from: Point, to: Point): SceneLine => ({ from, to, thickness: 3, color: SPLASH_COLORS.lane, delay: 500, duration: 1200 })

export const STREETS: SceneLine[] = [
  street({ x: -10, y: 140 }, { x: 270, y: 110 }, 0),
  street({ x: -10, y: 260 }, { x: 270, y: 300 }, 150),
  street({ x: 80, y: -10 }, { x: 60, y: 480 }, 300),
  street({ x: 190, y: -10 }, { x: 210, y: 480 }, 450),
  lane({ x: -10, y: 200 }, { x: 270, y: 205 }),
  lane({ x: 135, y: -10 }, { x: 130, y: 480 }),
]

/** The clients of the day, in the order the route visits them. */
export const STOPS: Point[] = [
  { x: 68, y: 130 },
  { x: 70, y: 270 },
  { x: 205, y: 290 },
  { x: 198, y: 118 },
]

export const PINS: ScenePin[] = STOPS.map((stop, index) => ({
  ...stop,
  color: index === STOPS.length - 1 ? SPLASH_COLORS.lastPin : SPLASH_COLORS.pin,
  delay: 1100 + index * 150,
}))

export const ROUTE_START = 1600
export const ROUTE_DURATION = 1000

export function segmentLength({ from, to }: Segment): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

export function segmentAngle({ from, to }: Segment): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

/**
 * The route between the pins, each leg drawn after the one before it, for a
 * time in proportion to its length, so the line moves at one speed.
 */
export function routeLegs(stops: Point[] = STOPS, start = ROUTE_START, duration = ROUTE_DURATION): SceneLine[] {
  const legs = stops.slice(1).map((to, index) => ({ from: stops[index], to }))
  const total = legs.reduce((sum, leg) => sum + segmentLength(leg), 0)
  let at = start
  return legs.map((leg) => {
    const time = total > 0 ? Math.round((segmentLength(leg) / total) * duration) : 0
    const line = { ...leg, thickness: 3, color: SPLASH_COLORS.route, delay: at, duration: time }
    at += time
    return line
  })
}

export const PULSE_START = 2600
export const PULSE_PERIOD = 1200
export const MAP_STEP_BACK = { delay: 2700, duration: 800, scale: 0.6, lift: -70, opacity: 0.35 } as const
export const TITLE = { delay: 3000, duration: 700 } as const
/** The name stays a moment, then the splash fades into the app. */
export const HOLD_UNTIL = 4100
export const FADE_OUT = 350
/** With «remove animations» on: the finished picture, briefly. */
export const STILL_HOLD = 900

/**
 * The scale that covers the whole screen with the scene (no bands at the
 * sides), and the offset that keeps its middle in the middle.
 */
export function coverScene(width: number, height: number): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(width / SCENE_WIDTH, height / SCENE_HEIGHT)
  return {
    scale,
    offsetX: (width - SCENE_WIDTH * scale) / 2,
    offsetY: (height - SCENE_HEIGHT * scale) / 2,
  }
}
