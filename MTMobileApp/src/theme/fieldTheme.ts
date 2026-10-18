import { Appearance } from "react-native"

/**
 * The app's colours, in a light and a night palette (owner, 2026-10-18: «он
 * адаптироваться должен под режим смартфонов и планшетов, ночной режим»;
 * mockup approved the same day).
 *
 * The palette is the phone's own theme, read once when the app's JS starts:
 * every screen builds its StyleSheet from `fieldTheme.color` at import, so
 * the colours are fixed for that run. A change while the app is open is
 * picked up by `color-scheme-reload.ts`, which restarts the JS when that
 * cannot cut off a recorded workday or a half-typed field.
 *
 * Every colour on a screen comes from here. A literal `#xxxxxx` in a
 * StyleSheet stays light in the night palette.
 */

const LIGHT = {
  canvas: "#F1F6F3",
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
  /** Text and icons on a filled colour: light in both palettes. */
  onColor: "#F8FCFA",
  /** A dimmed layer under a sheet or a dialog. */
  scrim: "rgba(19,35,31,0.42)",
}

export type FieldPalette = { [K in keyof typeof LIGHT]: string }

/**
 * The night palette: the same roles (owner's amendment: the app keeps its
 * green). One green is both the accent text on dark and the fill under
 * white button text, and no green reaches 4.5:1 for both; #1A8E6A gives
 * about 4:1 each way. The first night build used #3DB58B: bright on dark,
 * but white «Marşrut yarat» on it read at 2.5:1 (S23, 3.11.27). Fills that
 * are only fills take primaryStrong, white text on it at 4.6:1.
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
  onColor: "#F8FCFA",
  scrim: "rgba(0,0,0,0.6)",
}

export const FIELD_PALETTES: Readonly<Record<"light" | "dark", FieldPalette>> = { light: LIGHT, dark: DARK }

export type FieldColorScheme = "light" | "dark"

/** The phone's theme as Android reports it; anything else is the light one. */
export function fieldColorSchemeOf(value: string | null | undefined): FieldColorScheme {
  return value === "dark" ? "dark" : "light"
}

/**
 * The theme this run of the app was started in. A test that replaces
 * react-native without Appearance gets the light palette.
 */
export const fieldColorScheme: FieldColorScheme = fieldColorSchemeOf(Appearance?.getColorScheme?.())

export const fieldTheme = {
  color: FIELD_PALETTES[fieldColorScheme],
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 10, md: 16, lg: 22, pill: 999 },
} as const
