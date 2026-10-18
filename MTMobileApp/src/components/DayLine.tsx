import React from "react"
import { StyleSheet, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme } from "../theme/fieldTheme"
import { dayStripStops, type DayStopState } from "./day-line"

export type { DayStopState } from "./day-line"

/**
 * One stop on the day line. Done: a filled green stop with a check, the same
 * green as the line behind it. Visiting: amber ring with a soft amber halo.
 * Next: green ring. Planned: a hollow ring in the colour of the line ahead.
 */
export function DayLineStation({ state, compact = false }: { state: DayStopState; compact?: boolean }) {
  if (state === "done") {
    return (
      <View style={[styles.done, compact && styles.doneCompact]}>
        <Icon name="checkmark" size={compact ? 10 : 15} color={fieldTheme.color.onColor} />
      </View>
    )
  }
  if (state === "visiting") {
    return (
      <View style={[styles.halo, compact && styles.haloCompact]}>
        <View style={[styles.visiting, compact && styles.visitingCompact]} />
      </View>
    )
  }
  return <View style={[state === "next" ? styles.next : styles.planned, compact && styles.ringCompact]} />
}

/**
 * The line beside one row of a list: the piece above the stop, the stop, the
 * piece below. A piece is green once the stop it leads from is behind the
 * agent, so the line fills from top to bottom as the day goes. The column
 * stretches to the row's full height, so the pieces of neighbouring rows meet.
 */
export function DayLineRail({
  state,
  first,
  last,
  filledAbove,
  filledBelow,
}: {
  state: DayStopState
  first: boolean
  last: boolean
  filledAbove: boolean
  filledBelow: boolean
}) {
  return (
    <View style={styles.rail}>
      <View style={[styles.segment, first && styles.segmentHidden, filledAbove && styles.segmentFilled]} />
      <DayLineStation state={state} />
      <View style={[styles.segment, last && styles.segmentHidden, filledBelow && styles.segmentFilled]} />
    </View>
  )
}

/**
 * An agent's day across a card: visited stops, then the rest of the plan.
 * The numbers stand beside it, so the line is a picture of them, not a
 * replacement — screen readers get the label.
 */
export function DayLineStrip({ visited, planned, label }: { visited: number; planned: number; label: string }) {
  const stops = dayStripStops(visited, planned)
  if (stops.length === 0) return null
  return (
    <View style={styles.strip} accessible accessibilityLabel={label}>
      {stops.map((state, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={[styles.stripSegment, state === "done" && styles.segmentFilled]} /> : null}
          <DayLineStation state={state} compact />
        </React.Fragment>
      ))}
    </View>
  )
}

const LINE = 4

const styles = StyleSheet.create({
  rail: { width: 34, alignItems: "center", alignSelf: "stretch" },
  segment: { flex: 1, width: LINE, minHeight: 8, backgroundColor: fieldTheme.color.line },
  segmentFilled: { backgroundColor: fieldTheme.color.success },
  segmentHidden: { backgroundColor: "transparent" },
  done: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.success },
  doneCompact: { width: 16, height: 16, borderRadius: 8 },
  halo: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.amberSoft },
  haloCompact: { width: 20, height: 20, borderRadius: 10 },
  visiting: { width: 24, height: 24, borderRadius: 12, borderWidth: 6, borderColor: fieldTheme.color.amber, backgroundColor: fieldTheme.color.surface },
  visitingCompact: { width: 14, height: 14, borderRadius: 7, borderWidth: 4 },
  next: { width: 22, height: 22, borderRadius: 11, borderWidth: 5, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  planned: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: fieldTheme.color.line, backgroundColor: fieldTheme.color.surface },
  ringCompact: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
  strip: { flex: 1, minHeight: 20, flexDirection: "row", alignItems: "center" },
  stripSegment: { flex: 1, height: LINE, marginHorizontal: -1, backgroundColor: fieldTheme.color.line },
})
