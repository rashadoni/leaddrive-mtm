import React, { useEffect, useMemo, useState } from "react"
import { StyleSheet, View } from "react-native"
import RouteScreen from "./RouteScreen"
import WeekScreen from "../week/WeekScreen"
import { RouteSectionProvider, type RouteSectionView } from "./RouteSectionHeader"

export type RouteSectionParams = { view?: RouteSectionView } | undefined

/**
 * The agent's «Маршрут» tab: today's route and, under «Месяц», the calendar
 * (owner-approved mockup, 2026-10-20).
 *
 * Both stay mounted once opened, the hidden one out of the layout: switching
 * back must not lose an open visit's state or read the month again. The month
 * is read only when the agent first asks for it. A link from elsewhere — the
 * «Сегодня» card, a notification about a route for another day — opens the
 * month with `navigate("Route", { view: "month" })`.
 */
export default function RouteSectionScreen({ route }: { route?: { params?: RouteSectionParams } }) {
  const params = route?.params
  const [view, setView] = useState<RouteSectionView>(params?.view ?? "today")
  const [monthOpened, setMonthOpened] = useState(view === "month")

  // Every navigate() hands the tab a new params object, even with the same view.
  useEffect(() => {
    if (params?.view) setView(params.view)
  }, [params])

  useEffect(() => {
    if (view === "month") setMonthOpened(true)
  }, [view])

  const section = useMemo(() => ({ view, show: setView }), [view])

  return (
    <RouteSectionProvider value={section}>
      <View testID="route-section-today" style={[styles.pane, view !== "today" && styles.hidden]}>
        <RouteScreen />
      </View>
      {monthOpened || view === "month" ? (
        <View testID="route-section-month" style={[styles.pane, view !== "month" && styles.hidden]}>
          <WeekScreen />
        </View>
      ) : null}
    </RouteSectionProvider>
  )
}

// No colours here: each screen paints its own.
const styles = StyleSheet.create({
  pane: { flex: 1 },
  hidden: { display: "none" },
})
