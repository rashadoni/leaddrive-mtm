import { CommonActions, createNavigationContainerRef } from "@react-navigation/native"
import { guideNavigation } from "../guide/tour"

/**
 * The root navigator, for what lives beside it rather than in a screen: the
 * first-run guide reads the focused route from here and walks the tour's
 * screens through it.
 */
export const navigationRef = createNavigationContainerRef()

/** The deepest focused route: «Today», «MoreHome», «Notifications»… */
export function currentRouteName(): string | null {
  if (!navigationRef.isReady()) return null
  return navigationRef.getCurrentRoute()?.name ?? null
}

/** Opens the screen a step of the guide lives on (see guideNavigation). */
export function openGuideScreen(screen: string): void {
  if (!navigationRef.isReady()) return
  const { name, params, pop } = guideNavigation(screen)
  navigationRef.dispatch(CommonActions.navigate({ name, params, pop }))
}
