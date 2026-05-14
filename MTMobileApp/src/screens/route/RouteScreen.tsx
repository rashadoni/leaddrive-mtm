import React, { useEffect, useState, useCallback, useRef } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { api } from "../../services/api"
import { lastKnownPosition } from "../../services/location"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import NotesModal from "../../components/NotesModal"

interface RoutePoint {
  id: string
  orderIndex: number
  status: string
  plannedTime?: string
  visitedAt?: string
  distanceMeters?: number | null
  customer: { id: string; name: string; address?: string; latitude?: number; longitude?: number }
}

interface Route {
  id: string
  name?: string
  date: string
  status: string
  totalPoints: number
  visitedPoints: number
  points: RoutePoint[]
}

const GEOFENCE_DEFAULT = 100
const { width: SCREEN_WIDTH } = Dimensions.get("window")

function distanceColor(meters: number): string {
  if (meters < GEOFENCE_DEFAULT) return "#22c55e"
  if (meters < 500) return "#f59e0b"
  return "#ef4444"
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

// --- Bottom Sheet Component ---
function PointBottomSheet({
  visible,
  point,
  onClose,
  onNavigate,
  onCheckIn,
  mutating,
}: {
  visible: boolean
  point: RoutePoint | null
  onClose: () => void
  onNavigate: (point: RoutePoint) => void
  onCheckIn: (point: RoutePoint) => void
  mutating: boolean
}) {
  const slideAnim = useRef(new Animated.Value(400)).current
  const backdropAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  if (!point) return null

  const isVisited = point.status === "VISITED"
  const dist = point.distanceMeters
  const isNear = dist != null && dist < GEOFENCE_DEFAULT

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.sheetBackdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle bar */}
        <View style={styles.sheetHandle} />

        {/* Customer info */}
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetAvatar, isVisited && { backgroundColor: "#dcfce7" }]}>
            <Text style={[styles.sheetAvatarText, isVisited && { color: "#22c55e" }]}>
              {isVisited ? "✓" : point.customer.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetName}>{point.customer.name}</Text>
            {point.customer.address && (
              <View style={styles.sheetAddressRow}>
                <Text style={styles.sheetAddressIcon}>📍</Text>
                <Text style={styles.sheetAddress}>{point.customer.address}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Distance & status chips */}
        <View style={styles.sheetChips}>
          {isVisited ? (
            <View style={[styles.chip, { backgroundColor: "#dcfce7" }]}>
              <Text style={[styles.chipText, { color: "#22c55e" }]}>
                Visited {point.visitedAt ? new Date(point.visitedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              </Text>
            </View>
          ) : (
            <>
              {dist != null && (
                <View style={[styles.chip, { backgroundColor: distanceColor(dist) + "18" }]}>
                  <Text style={[styles.chipText, { color: distanceColor(dist) }]}>
                    {isNear ? "📍 " : "📏 "}{formatDistance(dist)}
                  </Text>
                </View>
              )}
              {point.plannedTime && (
                <View style={[styles.chip, { backgroundColor: "#f0f0ff" }]}>
                  <Text style={[styles.chipText, { color: "#6C63FF" }]}>
                    🕐 {new Date(point.plannedTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
              <View style={[styles.chip, { backgroundColor: "#f8fafc" }]}>
                <Text style={[styles.chipText, { color: "#94a3b8" }]}>
                  #{point.orderIndex + 1} in route
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Action buttons */}
        {!isVisited && (
          <View style={styles.sheetActions}>
            {point.customer.address && (
              <TouchableOpacity
                style={styles.sheetNavBtn}
                onPress={() => { onClose(); onNavigate(point) }}
              >
                <Text style={styles.sheetNavIcon}>🧭</Text>
                <Text style={styles.sheetNavText}>Navigate</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.sheetCheckInBtn, mutating && { opacity: 0.6 }]}
              onPress={() => onCheckIn(point)}
              disabled={mutating}
            >
              <Text style={styles.sheetCheckInIcon}>{mutating ? "⏳" : "📋"}</Text>
              <Text style={styles.sheetCheckInText}>{mutating ? "Checking in..." : "Check In"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {isVisited && (
          <View style={styles.sheetVisitedNote}>
            <Text style={styles.sheetVisitedText}>This point has already been visited</Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  )
}

export default function RouteScreen() {
  const agent = useAuthStore((s) => s.agent)
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [agentCoords, setAgentCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<RoutePoint | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)

  // Active visit state
  const [activeVisit, setActiveVisit] = useState<{ id: string; checkInAt: string; customer: { id: string; name: string } } | null>(null)
  const [elapsedMin, setElapsedMin] = useState(0)
  const [notesVisible, setNotesVisible] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)

  useEffect(() => {
    Geolocation.getCurrentPosition(
      (pos) => setAgentCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  const fetchActiveVisit = useCallback(async () => {
    try {
      const res = await api.getVisits({ limit: 10 })
      if (res.success) {
        const visits = res.data?.visits || res.data || []
        const list = Array.isArray(visits) ? visits : []
        const active = list.find((v: any) => v.status === "CHECKED_IN") || null
        setActiveVisit(active)
        if (!active) { setPhotoCount(0) }
      }
    } catch {
      setActiveVisit(null)
    }
  }, [])

  // Elapsed time timer for active visit
  useEffect(() => {
    if (!activeVisit) { setElapsedMin(0); return }
    const calc = () => {
      const diff = Date.now() - new Date(activeVisit.checkInAt).getTime()
      setElapsedMin(Math.floor(diff / 60000))
    }
    calc()
    const interval = setInterval(calc, 30000)
    return () => clearInterval(interval)
  }, [activeVisit])

  const fetchRoute = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0]
      let res = await api.getRoutes(today)
      if (!res.success || !res.data?.routes?.length) {
        res = await api.getRoutes()
      }
      if (res.success && res.data?.routes?.length > 0) {
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        // Two bugs lived here before:
        //  1. The list was sorted ASC by date and `sorted[0]` taken, so
        //     when an agent had multiple PLANNED routes for the same
        //     day (supervisor regenerated the plan), the OLDER route
        //     won.
        //  2. COMPLETED / CANCELLED routes weren't filtered out — a
        //     finished route from earlier today could still be shown.
        // The server now returns rows ordered by date DESC then
        // createdAt DESC, so we just respect that order, drop closed
        // routes, and take the first active match.
        const ACTIVE_STATUS = new Set(["PLANNED", "IN_PROGRESS"])
        const activeForToday = res.data.routes.filter((r: any) =>
          new Date(r.date) >= now && ACTIVE_STATUS.has(r.status)
        )
        const routeData = activeForToday[0] || res.data.routes[0]
        if (routeData?.id) {
          const coords = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
            Geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
            )
          })
          if (coords) setAgentCoords(coords)
          const detail = await api.getRoute(routeData.id, coords ?? undefined)
          if (detail.success) { setRoute(detail.data); return }
        }
        setRoute(routeData)
      } else {
        setRoute(null)
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") console.warn("Failed to fetch route:", e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchRoute(); fetchActiveVisit() }, [fetchRoute, fetchActiveVisit])

  const completion = route ? Math.round((route.visitedPoints / Math.max(route.totalPoints, 1)) * 100) : 0
  const remaining = route ? route.totalPoints - route.visitedPoints : 0

  const handlePointPress = (point: RoutePoint) => {
    setSelectedPoint(point)
    setSheetVisible(true)
  }

  const handleNavigate = (point: RoutePoint) => {
    if (point.customer.address) {
      const addr = encodeURIComponent(point.customer.address)
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${addr}`)
    }
  }

  const handleCheckIn = async (point: RoutePoint) => {
    if (mutating) return
    setMutating(true)
    try {
      let coords: { latitude: number; longitude: number } | null = null
      try {
        coords = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
          )
        })
      } catch {
        // Fresh GPS failed — fall back to cached position from location
        // service silently. Location service streams continuous updates
        // in the background, so the cached fix is typically <30s old.
        // The downstream geofence check (below) is the only gate that
        // matters; a modal here read as an error to users even when the
        // cached accuracy was excellent (e.g. 10m).
        //
        // Staleness guard: if the background service died (Android killed
        // the foreground process, permission revoked mid-session) the
        // cache can grow arbitrarily old. Reject cache > STALE_LIMIT and
        // fall through to the Retry alert so the user retries fresh GPS
        // rather than checking in against a hours-old fix.
        const STALE_LIMIT = 120_000 // 2 min
        const cacheFresh = lastKnownPosition && (Date.now() - lastKnownPosition.timestamp) < STALE_LIMIT
        if (cacheFresh) {
          coords = { latitude: lastKnownPosition!.latitude, longitude: lastKnownPosition!.longitude }
        } else {
          // No fresh cached position — only allow retry
          await new Promise<void>((resolve) => {
            Alert.alert(
              "Location Unavailable",
              "Could not determine your position. Please make sure GPS is enabled and try again.",
              [{ text: "Retry", onPress: () => resolve() }]
            )
          })
          setMutating(false)
          return
        }
      }

      // F-28 client-gate: only SUPERVISOR/MANAGER/ADMIN see the "Try
      // Anyway" override button. AGENT-role users get a single Cancel
      // because the server would 403 the force=true POST anyway. This
      // matches VisitScreen.tsx behavior and avoids a misleading
      // success-looking button that actually fails server-side.
      let forceCheckIn = false
      if (coords && point.distanceMeters != null && point.distanceMeters > GEOFENCE_DEFAULT) {
        const canOverride = api.canForceCheckIn
        const proceed = await new Promise<boolean>((resolve) => {
          const buttons: Array<{ text: string; onPress: () => void; style?: "cancel" }> = canOverride
            ? [
                { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
                { text: "Try Anyway", onPress: () => resolve(true) },
              ]
            : [{ text: "OK", onPress: () => resolve(false) }]
          const message = canOverride
            ? `You are ${formatDistance(point.distanceMeters!)} from ${point.customer.name}.\nYou need to be within ${GEOFENCE_DEFAULT}m to check in.`
            : `You are ${formatDistance(point.distanceMeters!)} from ${point.customer.name}.\nMust be within ${GEOFENCE_DEFAULT}m. Ask your supervisor if you need an override.`
          Alert.alert("Too Far Away", message, buttons)
        })
        if (!proceed) { setMutating(false); return }
        forceCheckIn = true
      }

      const res = await api.checkIn({
        customerId: point.customer.id,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        ...(forceCheckIn && { force: true }),
      })
      if (res.success) {
        setSheetVisible(false)
        setSelectedPoint(null)
        Alert.alert("Checked In", `You are now at ${point.customer.name}`, [
          { text: "OK", onPress: () => { fetchRoute(); fetchActiveVisit() } },
        ])
      } else if (res.error) {
        Alert.alert("Check-in Blocked", res.error)
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") Alert.alert("Error", e.message || "Check-in failed")
    } finally {
      setMutating(false)
    }
  }

  // Check-out flow
  const handleCheckOut = () => {
    if (!activeVisit || mutating) return
    setNotesVisible(true)
  }

  const performCheckOut = async (notes?: string) => {
    if (!activeVisit || mutating) return
    setMutating(true)
    try {
      let coords: { latitude: number; longitude: number } | null = null
      try {
        coords = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
          )
        })
      } catch {}
      const res = await api.checkOut(activeVisit.id, {
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        notes: notes || undefined,
      })
      if (res.success) {
        Alert.alert("Checked Out", "Visit completed successfully")
        setActiveVisit(null)
        setPhotoCount(0)
        fetchRoute()
        fetchActiveVisit()
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") Alert.alert("Error", e.message || "Check-out failed")
    } finally {
      setMutating(false)
    }
  }

  const sortedPoints = route?.points ? [...route.points].sort((a, b) => a.orderIndex - b.orderIndex) : []
  const nextPendingIdx = sortedPoints.findIndex((p) => p.status === "PENDING")

  return (
    <View style={styles.container}>
      {/* Header with gradient feel */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Hello, {agent?.name?.split(" ")[0]}!</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
          </View>
          {route && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeNum}>{remaining}</Text>
              <Text style={styles.headerBadgeLabel}>left</Text>
            </View>
          )}
        </View>
      </View>

      {/* Route summary card */}
      {route ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>{route.name || "Route"}</Text>
              <Text style={styles.summaryDate}>
                {new Date(route.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {new Date(route.date).toDateString() === new Date().toDateString() && (
                  <Text style={{ color: "#6C63FF" }}>  Today</Text>
                )}
              </Text>
            </View>
            <View style={[
              styles.statusPill,
              route.status === "COMPLETED" ? styles.statusCompleted : styles.statusPlanned,
            ]}>
              <Text style={[
                styles.statusPillText,
                { color: route.status === "COMPLETED" ? "#22c55e" : "#6C63FF" },
              ]}>
                {route.status === "IN_PROGRESS" ? "IN PROGRESS" : route.status}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatBox value={route.totalPoints} label="Total" color="#0B0B1E" />
            <View style={styles.statDivider} />
            <StatBox value={route.visitedPoints} label="Visited" color="#22c55e" />
            <View style={styles.statDivider} />
            <StatBox value={remaining} label="Left" color={remaining > 0 ? "#f59e0b" : "#22c55e"} />
            <View style={styles.statDivider} />
            <StatBox value={`${completion}%`} label="Done" color="#6C63FF" />
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressBar,
              { width: `${Math.max(completion, 2)}%` },
              completion === 100 && { backgroundColor: "#22c55e" },
            ]} />
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>📍</Text>
          </View>
          <Text style={styles.emptyTitle}>{loading ? "Loading route..." : "No Route Today"}</Text>
          <Text style={styles.emptySubtitle}>
            {loading ? "Fetching your schedule" : "Check back later or pull to refresh"}
          </Text>
        </View>
      )}

      {/* Active visit banner */}
      {activeVisit && (
        <View style={styles.activeBanner}>
          <View style={styles.activePulseOuter}>
            <View style={styles.activePulseInner} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeLabel}>Currently at</Text>
            <Text style={styles.activeName}>{activeVisit.customer?.name || "Customer"}</Text>
            <Text style={styles.activeTime}>
              {elapsedMin} min elapsed{photoCount > 0 ? `  •  ${photoCount} photos` : ""}
            </Text>
          </View>
          <View style={styles.activeBtns}>
            <TouchableOpacity
              style={[styles.checkOutBtn, mutating && { opacity: 0.5 }]}
              onPress={handleCheckOut}
              disabled={mutating}
            >
              {mutating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.checkOutText}>Check Out</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Section header */}
      {sortedPoints.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Route Points</Text>
          <Text style={styles.sectionCount}>{sortedPoints.length} stops</Text>
        </View>
      )}

      {/* Points list */}
      {sortedPoints.length > 0 && (
        <FlatList
          data={sortedPoints}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarPadding }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRoute() }} tintColor="#6C63FF" />
          }
          renderItem={({ item, index }) => {
            const isVisited = item.status === "VISITED"
            const isSkipped = item.status === "SKIPPED"
            const isPending = item.status === "PENDING"
            const isNext = index === nextPendingIdx
            const dist = item.distanceMeters

            return (
              <TouchableOpacity
                style={styles.pointRow}
                onPress={() => handlePointPress(item)}
                activeOpacity={0.7}
              >
                {/* Timeline */}
                <View style={styles.timeline}>
                  <View style={[
                    styles.dot,
                    isVisited && styles.dotVisited,
                    isSkipped && styles.dotSkipped,
                    isNext && styles.dotNext,
                  ]}>
                    {isVisited && <Text style={styles.dotIcon}>✓</Text>}
                    {isSkipped && <Text style={styles.dotIcon}>✕</Text>}
                    {isPending && (
                      <Text style={[styles.dotNum, isNext && { color: "#fff" }]}>{index + 1}</Text>
                    )}
                  </View>
                  {index < sortedPoints.length - 1 && (
                    <View style={[
                      styles.connector,
                      isVisited && { backgroundColor: "#22c55e" },
                    ]} />
                  )}
                </View>

                {/* Card */}
                <View style={[
                  styles.card,
                  isVisited && styles.cardVisited,
                  isNext && styles.cardNext,
                ]}>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardName, isVisited && styles.cardNameVisited]} numberOfLines={1}>
                      {item.customer.name}
                    </Text>
                    {item.customer.address && (
                      <Text style={styles.cardAddress} numberOfLines={1}>{item.customer.address}</Text>
                    )}

                    {/* Meta row */}
                    <View style={styles.cardMeta}>
                      {item.plannedTime && (
                        <View style={styles.metaTag}>
                          <Text style={styles.metaText}>
                            🕐 {new Date(item.plannedTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                      )}
                      {item.visitedAt && (
                        <View style={[styles.metaTag, { backgroundColor: "#dcfce7" }]}>
                          <Text style={[styles.metaText, { color: "#22c55e" }]}>
                            ✓ {new Date(item.visitedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                      )}
                      {isPending && dist != null && (
                        <View style={[styles.metaTag, { backgroundColor: distanceColor(dist) + "15" }]}>
                          <Text style={[styles.metaText, { color: distanceColor(dist) }]}>
                            {formatDistance(dist)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Right side action hint */}
                  {isPending && (
                    <View style={styles.cardArrow}>
                      <Text style={{ color: isNext ? "#6C63FF" : "#cbd5e1", fontSize: 18 }}>›</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Bottom Sheet */}
      <PointBottomSheet
        visible={sheetVisible}
        point={selectedPoint}
        onClose={() => { setSheetVisible(false); setSelectedPoint(null) }}
        onNavigate={handleNavigate}
        onCheckIn={handleCheckIn}
        mutating={mutating}
      />

      {/* Check-out notes modal */}
      <NotesModal
        visible={notesVisible}
        title="Check Out"
        message="Add notes about this visit (optional):"
        onCancel={() => setNotesVisible(false)}
        onSubmit={(text) => { setNotesVisible(false); performCheckOut(text) }}
      />

      {/* Photo capture available on Visit tab */}
    </View>
  )
}

function StatBox({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // --- Header ---
  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  date: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  headerBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  headerBadgeNum: { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerBadgeLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase" },

  // --- Summary Card ---
  summaryCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -14,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 17, fontWeight: "700", color: "#0B0B1E" },
  summaryDate: { fontSize: 12, color: "#94a3b8", marginTop: 3 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusCompleted: { backgroundColor: "#dcfce7" },
  statusPlanned: { backgroundColor: "#f0f0ff" },
  statusPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  statBox: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },

  progressTrack: {
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#6C63FF",
    borderRadius: 3,
  },

  // --- Empty ---
  emptyCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f0f0ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0B0B1E", marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: "#94a3b8", textAlign: "center" },

  // --- Active visit banner ---
  activeBanner: {
    backgroundColor: "#dcfce7",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#86efac",
  },
  activePulseOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  activePulseInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e" },
  activeLabel: { fontSize: 10, color: "#15803d", textTransform: "uppercase", fontWeight: "700", letterSpacing: 0.5 },
  activeName: { fontSize: 15, fontWeight: "700", color: "#0B0B1E", marginTop: 2 },
  activeTime: { fontSize: 11, color: "#64748b", marginTop: 3 },
  activeBtns: { gap: 6 },
  photoBtn: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  photoBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  checkOutBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  checkOutText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // --- Section header ---
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, color: "#94a3b8" },

  // --- Timeline & Points ---
  pointRow: { flexDirection: "row", marginBottom: 0 },

  timeline: { width: 40, alignItems: "center" },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#e2e8f0",
  },
  dotVisited: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  dotSkipped: { backgroundColor: "#ef4444", borderColor: "#ef4444" },
  dotNext: { backgroundColor: "#6C63FF", borderColor: "#6C63FF" },
  dotIcon: { color: "#fff", fontSize: 13, fontWeight: "800" },
  dotNum: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  connector: {
    width: 2.5,
    flex: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: 1,
    marginVertical: 2,
  },

  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginLeft: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardVisited: { backgroundColor: "#fafafa", borderColor: "#e8e8e8" },
  cardNext: {
    borderColor: "#6C63FF",
    borderWidth: 1.5,
    shadowColor: "#6C63FF",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: "700", color: "#0B0B1E" },
  cardNameVisited: { color: "#94a3b8", textDecorationLine: "line-through" },
  cardAddress: { fontSize: 11, color: "#94a3b8", marginTop: 3 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaTag: {
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  metaText: { fontSize: 10, fontWeight: "600", color: "#64748b" },
  cardArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  // --- Bottom Sheet ---
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  sheetAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#f0f0ff",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetAvatarText: { fontSize: 22, fontWeight: "800", color: "#6C63FF" },
  sheetName: { fontSize: 18, fontWeight: "700", color: "#0B0B1E" },
  sheetAddressRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  sheetAddressIcon: { fontSize: 12 },
  sheetAddress: { fontSize: 13, color: "#64748b", flex: 1 },

  sheetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: "600" },

  sheetActions: {
    flexDirection: "row",
    gap: 10,
  },
  sheetNavBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sheetNavIcon: { fontSize: 20 },
  sheetNavText: { fontSize: 15, fontWeight: "600", color: "#334155" },
  sheetCheckInBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 16,
  },
  sheetCheckInIcon: { fontSize: 18 },
  sheetCheckInText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  sheetVisitedNote: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  sheetVisitedText: { fontSize: 13, color: "#22c55e", fontWeight: "600" },
})
