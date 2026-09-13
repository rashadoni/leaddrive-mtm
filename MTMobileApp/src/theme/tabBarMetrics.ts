/**
 * The phone tab bar's height above the safe area.
 *
 * It lives here, in a module with no `.android` twin, on purpose. B18 first put
 * it in `hooks/useTabBarHeight.ts`, but Metro resolves that import to
 * `useTabBarHeight.android.ts` on Android, which did not export it. The
 * navigator read `undefined`, the tab bar's height became NaN and was dropped,
 * and on the phone the bar collapsed to its own padding: tab buttons squeezed
 * to 28 px, captions at zero height. Jest resolves the plain `.ts` file, so
 * every test stayed green. Measured on a Samsung S23 Ultra, 2026-09-13.
 */
export const TAB_BAR_BASE_HEIGHT = 63
