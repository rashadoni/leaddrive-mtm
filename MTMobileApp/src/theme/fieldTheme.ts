import { createElement, useSyncExternalStore, type ComponentType, type ReactElement } from "react"
import { Appearance } from "react-native"

/**
 * The app's colours, in a light and a night palette (owner, 2026-10-18: «он
 * адаптироваться должен под режим смартфонов и планшетов, ночной режим»;
 * mockup approved the same day).
 *
 * The palette is the phone's own theme, and it follows the phone while the
 * app is open (owner, 2026-10-20: «если я меняю тему на телефоне на светлую,
 * то приложение не меняется на светлую тему»). The first night build fixed
 * the colours when the JS started and restarted the JS on a switch — but not
 * during a workday, since the day's GPS runs in that JS, so an agent's phone
 * kept the old theme all day. Now nothing restarts:
 *
 *  - `fieldTheme.color` and `fieldTheme.card` answer for the theme the phone
 *    is in at the moment they are read;
 *  - a sheet built at import is built for both themes by `themed()`, and
 *    hands out the one the phone is in;
 *  - `services/follow-phone-color-scheme.ts` tells `setFieldColorScheme()`
 *    when the phone switches, and every screen draws itself again, with what
 *    is typed, the open visit and the day's track left as they were.
 *
 * Every colour on a screen comes from here. A literal `#xxxxxx` in a
 * StyleSheet stays light in the night palette; a colour read from
 * `fieldTheme.color` at import outside `themed()` stays in the theme the app
 * started in.
 */

const LIGHT = {
  /**
   * The ground every screen stands on: a soft evergreen tint one step below
   * the white cards (owner, 2026-10-18: «как будто А4 бумага и на ней
   * менюшки» — the ground was #F1F6F3, a shade off the cards' white).
   */
  canvas: "#E3ECE7",
  surface: "#FBFDFC",
  surfaceStrong: "#E5F0EA",
  ink: "#13231F",
  inkMuted: "#5E7069",
  border: "#D6E3DC",
  primary: "#08705A",
  primaryStrong: "#055342",
  primarySoft: "#D9F1E8",
  coral: "#A43B25",
  coralSoft: "#FDE6DF",
  amber: "#8B5A00",
  amberSoft: "#FAEECF",
  blue: "#2E73D2",
  blueSoft: "#DFEBFA",
  violet: "#7155B7",
  violetSoft: "#ECE6F7",
  danger: "#C73B3B",
  dangerSoft: "#F8E1E1",
  success: "#1C7A50",
  successSoft: "#DAEFE4",
  /**
   * The fill under onColor text and icons, one per accent: a button, a
   * badge, a stop on the day line. By day it is the accent itself. At night
   * the accents are light, to read as text on the dark ground, and white on
   * them read at about 2:1 — the night «Connect» on the first screen
   * (3.11.37) was white on #F08A70 — so the night fill is a deeper shade of
   * the same accent.
   */
  coralFill: "#A43B25",
  amberFill: "#8B5A00",
  blueFill: "#2E73D2",
  violetFill: "#7155B7",
  successFill: "#1C7A50",
  /** Text and icons on a filled colour: light in both palettes. */
  onColor: "#F8FCFA",
  /** A dimmed layer under a sheet or a dialog. */
  scrim: "rgba(19,35,31,0.42)",
  /** The day line ahead of the agent: track and rings of the stops still to come. */
  line: "#C7D6CE",
}

export type FieldPalette = { [K in keyof typeof LIGHT]: string }

/**
 * The night palette: the same roles (owner's amendment: the app keeps its
 * green). One green is both the accent text on dark and the fill under
 * white button text, and no green reaches 4.5:1 for both; #1A8E6A gives
 * about 4:1 each way. The first night build used #3DB58B: bright on dark,
 * but white «Marşrut yarat» on it read at 2.5:1 (S23, 3.11.27). Fills that
 * are only fills take primaryStrong, white text on it at 4.6:1. The other
 * accents have their own fill under white, about 4.8:1 at night.
 */
const DARK: FieldPalette = {
  canvas: "#0E1412",
  surface: "#161E1B",
  surfaceStrong: "#1F2925",
  ink: "#E5EEEA",
  inkMuted: "#9AAAA4",
  border: "#2A3631",
  primary: "#1A8E6A",
  primaryStrong: "#16825F",
  primarySoft: "#163A2F",
  coral: "#F08A70",
  coralSoft: "#3A231C",
  amber: "#E3AE45",
  amberSoft: "#3A2E15",
  blue: "#6EA8F0",
  blueSoft: "#17283F",
  violet: "#A891EC",
  violetSoft: "#2A2440",
  danger: "#D24F4F",
  dangerSoft: "#3D1E1E",
  success: "#4CC48C",
  successSoft: "#15352A",
  coralFill: "#C2482A",
  amberFill: "#8F6A22",
  blueFill: "#2C6FC8",
  violetFill: "#7A5BD0",
  successFill: "#2A7F57",
  onColor: "#F8FCFA",
  scrim: "rgba(0,0,0,0.6)",
  line: "#33423C",
}

export const FIELD_PALETTES: Readonly<Record<"light" | "dark", FieldPalette>> = { light: LIGHT, dark: DARK }

export type FieldColorScheme = "light" | "dark"

/** The phone's theme as Android reports it; anything else is the light one. */
export function fieldColorSchemeOf(value: string | null | undefined): FieldColorScheme {
  return value === "dark" ? "dark" : "light"
}

const SCHEMES: readonly FieldColorScheme[] = ["light", "dark"]

/**
 * The theme on the screen now. It starts as the phone's; a test that replaces
 * react-native without Appearance gets the light palette.
 */
let activeScheme: FieldColorScheme = fieldColorSchemeOf(Appearance?.getColorScheme?.())
/** Set only while `themedVariants()` builds a value for one of the themes. */
let buildingScheme: FieldColorScheme | null = null
const schemeListeners = new Set<() => void>()

/**
 * The theme a colour read now belongs to: the one on the screen, or, inside
 * a `themed()` builder, the one being built.
 */
export function currentFieldColorScheme(): FieldColorScheme {
  return buildingScheme ?? activeScheme
}

/** The phone switched day and night: every subscribed screen draws itself again. */
export function setFieldColorScheme(next: FieldColorScheme): void {
  if (next === activeScheme) return
  activeScheme = next
  for (const listener of [...schemeListeners]) listener()
}

export function subscribeFieldColorScheme(listener: () => void): () => void {
  schemeListeners.add(listener)
  return () => {
    schemeListeners.delete(listener)
  }
}

const activeFieldColorScheme = () => activeScheme

/**
 * The theme on the screen, for a component that must draw itself again when
 * it changes. A screen registered in the navigator gets this from
 * `withFieldColorScheme`, and whatever it renders follows.
 */
export function useFieldColorScheme(): FieldColorScheme {
  return useSyncExternalStore(subscribeFieldColorScheme, activeFieldColorScheme, activeFieldColorScheme)
}

const followingScreens = new WeakMap<ComponentType<any>, ComponentType<any>>()

/**
 * A screen as the navigator registers it, drawn again when the phone
 * switches day and night. The navigator does not draw a screen again on its
 * own (it holds each one still unless its route changes), so every
 * `component=` there goes through this. The same screen gets the same
 * wrapper every time, or the navigator would mount it afresh.
 */
export function withFieldColorScheme<P extends object>(Screen: ComponentType<P>): (props: P) => ReactElement {
  const known = followingScreens.get(Screen)
  if (known) return known as (props: P) => ReactElement
  // A plain function component, as the screens themselves are: the navigator
  // types its `component` from the screen's props, and a class would not fit.
  function FollowsPhoneColorScheme(props: P): ReactElement {
    useFieldColorScheme()
    return createElement(Screen as ComponentType<any>, props)
  }
  FollowsPhoneColorScheme.displayName = `FollowsPhoneColorScheme(${Screen.displayName ?? Screen.name ?? "Screen"})`
  followingScreens.set(Screen, FollowsPhoneColorScheme)
  return FollowsPhoneColorScheme
}

/** One value built for each theme: `build` reads `fieldTheme.color` as that theme's. */
export function themedVariants<T>(build: () => T): Readonly<Record<FieldColorScheme, T>> {
  const variants = {} as Record<FieldColorScheme, T>
  for (const scheme of SCHEMES) {
    const outer = buildingScheme
    buildingScheme = scheme
    try {
      variants[scheme] = build()
    } finally {
      buildingScheme = outer
    }
  }
  return variants
}

/**
 * A sheet or a colour map made at import, in both themes:
 * `const styles = themed(() => StyleSheet.create({ ... }))`. `styles.card`
 * is the night card while the phone is dark, the day card otherwise, read at
 * the moment a screen draws.
 */
export function themed<T extends object>(build: () => T): T {
  const variants = themedVariants(build)
  const live = {} as T
  const keys = new Set([...Object.keys(variants.light), ...Object.keys(variants.dark)])
  for (const key of keys) {
    Object.defineProperty(live, key, {
      enumerable: true,
      get: () => (variants[currentFieldColorScheme()] as Record<string, unknown>)[key],
    })
  }
  return live
}

/** `fieldTheme.color`: each colour of the theme on the screen at the moment it is read. */
const LIVE_COLOR = {} as FieldPalette
for (const key of Object.keys(LIGHT) as (keyof FieldPalette)[]) {
  Object.defineProperty(LIVE_COLOR, key, {
    enumerable: true,
    get: () => FIELD_PALETTES[currentFieldColorScheme()][key],
  })
}

/**
 * A card raised off the ground. By day a soft shadow lifts it (Material
 * elevation); on the night ground a shadow does not show, so a hairline
 * border separates it instead. Spread first, then the card's own padding and
 * radius.
 */
export const FIELD_CARDS = {
  light: {
    backgroundColor: LIGHT.surface,
    borderWidth: 0,
    elevation: 2,
    shadowColor: LIGHT.ink,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  dark: {
    backgroundColor: DARK.surface,
    borderWidth: 1,
    borderColor: DARK.border,
    elevation: 0,
  },
} as const

const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
const RADIUS = { sm: 10, md: 16, lg: 22, pill: 999 } as const

export const fieldTheme: {
  readonly color: Readonly<FieldPalette>
  readonly card: (typeof FIELD_CARDS)[FieldColorScheme]
  readonly space: typeof SPACE
  readonly radius: typeof RADIUS
} = {
  color: LIVE_COLOR,
  get card() {
    return FIELD_CARDS[currentFieldColorScheme()]
  },
  space: SPACE,
  radius: RADIUS,
}
