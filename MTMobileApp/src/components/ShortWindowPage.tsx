import React from "react"
import { ScrollView, StyleSheet } from "react-native"

/**
 * A loading, error or empty panel on a window too short for a pinned header
 * (`isShortWindow`): the header and the panel become one scrolling page, so the
 * panel's button stays reachable under a header that took half of a phone held
 * on its side (Galaxy S23, 384 dp, 2026-09-14). On a taller window it renders
 * the panel alone and the screen keeps its header above it, as before.
 */
export default function ShortWindowPage({ short, header, children }: {
  short: boolean
  header: React.ReactNode
  children: React.ReactNode
}) {
  if (!short) return <>{children}</>
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      {header}
      {children}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flexGrow: 1 },
})
