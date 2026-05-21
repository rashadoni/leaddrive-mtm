import React, { useEffect, useState, useCallback } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Linking,
  TextInput,
  ScrollView,
} from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { lastKnownPosition } from "../../services/location"
import { api } from "../../services/api"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import NotesModal from "../../components/NotesModal"
import PhotoCaptureModal from "../../components/PhotoCaptureModal"
import FeedbackToast from "../../components/FeedbackToast"
import ConfirmSheet from "../../components/ConfirmSheet"

interface Visit {
  id: string
  status: string
  checkInAt: string
  checkOutAt?: string
  duration?: number
  customer: { id: string; name: string; address?: string }
  notes?: string
}

interface Customer {
  id: string
  name: string
  address?: string
  category?: string
  latitude?: number
  longitude?: number
  distanceMeters?: number
}

const GEOFENCE_DEFAULT = 100

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const p1 = toRad(lat1), p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function distanceColor(meters: number): string {
  if (meters < GEOFENCE_DEFAULT) return "#22c55e"
  if (meters < 500) return "#f59e0b"
  return "#ef4444"
}

export default function VisitScreen() {
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [visits, setVisits] = useState<Visit[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null)
  const [mutating, setMutating] = useState(false)
  const [notesVisible, setNotesVisible] = useState(false)
  const [cameraVisible, setCameraVisible] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)
  const [elapsedMin, setElapsedMin] = useState(0)
  const [agentCoords, setAgentCoords] = useState<{ latitude: number; longitude: number } | null>(null)

  // Toast state
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error" | "warning" | "info"; title: string; message?: string }>({
    visible: false, type: "success", title: "",
  })

  // Confirm sheet state
  const [confirm, setConfirm] = useState<{
    visible: boolean; icon?: string; iconColor?: string; title: string; message: string;
    confirmText?: string; confirmColor?: string; destructive?: boolean;
    onConfirm: () => void
  }>({ visible: false, title: "", message: "", onConfirm: () => {} })

  // Customer search
  const [searchQuery, setSearchQuery] = useState("")

  // Pending check-in customer (for confirm flow)
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null)

  // Pending geofence resolve (for async confirm flow)
  const [pendingGeofenceResolve, setPendingGeofenceResolve] = useState<((v: boolean) => void) | null>(null)

  const showToast = (type: "success" | "error" | "warning" | "info", title: string, message?: string) => {
    setToast({ visible: true, type, title, message })
  }

  useEffect(() => {
    Geolocation.getCurrentPosition(
      (pos) => setAgentCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const [visitsRes, customersRes] = await Promise.all([
        api.getVisits({ limit: 20 }),
        api.getCustomers(),
      ])
      if (visitsRes.success) {
        const list = visitsRes.data?.visits || []
        setVisits(list)
        setActiveVisit(list.find((v: Visit) => v.status === "CHECKED_IN") || null)
      }
      if (customersRes.success) {
        setCustomers(customersRes.data?.customers || [])
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") console.warn("Failed to fetch visits:", e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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

  const customersWithDistance: Customer[] = React.useMemo(() => {
    if (!agentCoords) return customers
    return [...customers]
      .map((c) => {
        if (c.latitude != null && c.longitude != null) {
          return { ...c, distanceMeters: Math.round(haversineDistance(agentCoords.latitude, agentCoords.longitude, c.latitude, c.longitude)) }
        }
        return c
      })
      .sort((a, b) => {
        if (a.distanceMeters == null && b.distanceMeters == null) return 0
        if (a.distanceMeters == null) return 1
        if (b.distanceMeters == null) return -1
        return a.distanceMeters - b.distanceMeters
      })
  }, [customers, agentCoords])

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true
    try {
      const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
      if (fine) return true
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: "Location Required",
        message: "MTM needs access to your location for check-in verification.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      })
      if (result === PermissionsAndroid.RESULTS.GRANTED) return true
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setConfirm({
          visible: true,
          icon: "⚙️",
          iconColor: "#ef4444",
          title: "Location Permission Required",
          message: "Location access was permanently denied. Please enable it in Settings → Apps → MTMobileApp → Permissions → Location.",
          confirmText: "Open Settings",
          confirmColor: "#6C63FF",
          onConfirm: () => { setConfirm(c => ({ ...c, visible: false })); Linking.openSettings() },
        })
      }
      return false
    } catch {
      return false
    }
  }

  const getCoords = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const hasPermission = await requestLocationPermission()
    if (!hasPermission) return null

    try {
      return await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        )
      })
    } catch {
      setToast({ visible: true, type: "error", message: "GPS signal not found. Make sure location is enabled and try again." })
      return null
    }
  }

  const handleCheckIn = (customer: Customer) => {
    if (mutating || activeVisit) return
    setPendingCustomer(customer)
    setConfirm({
      visible: true,
      icon: "📋",
      iconColor: "#6C63FF",
      title: `Check in at ${customer.name}?`,
      message: customer.address || "No address on file",
      confirmText: "Check In",
      onConfirm: () => {
        setConfirm(c => ({ ...c, visible: false }))
        performCheckIn(customer)
      },
    })
  }

  const performCheckIn = async (customer: Customer) => {
    if (mutating) return
    setMutating(true)
    try {
      let coords = await getCoords()
      // If fresh GPS fails, try cached position from background tracking
      if (!coords && lastKnownPosition) {
        coords = { latitude: lastKnownPosition.latitude, longitude: lastKnownPosition.longitude }
        showToast("warning", "Using Last Position", `Accuracy: ${lastKnownPosition.accuracy?.toFixed(0) || "?"}m`)
      }
      if (!coords) {
        showToast("error", "GPS Unavailable", "Cannot determine your location. Try again.")
        setMutating(false)
        return
      }

      // Geofence check — warn if beyond GEOFENCE_DEFAULT meters but allow
      // override only for SUPERVISOR/MANAGER/ADMIN (F-28 client-gate).
      // AGENT role would 403 server-side on force=true, so don't even
      // surface the override prompt — show a toast instead and bail.
      let forceCheckIn = false
      if (customer.latitude != null && customer.longitude != null) {
        const distance = Math.round(haversineDistance(coords.latitude, coords.longitude, customer.latitude, customer.longitude))
        if (distance > GEOFENCE_DEFAULT) {
          if (!api.canForceCheckIn) {
            showToast(
              "error",
              "Too Far Away",
              `${formatDistance(distance)} from ${customer.name} (max ${GEOFENCE_DEFAULT}m). Ask your supervisor.`,
            )
            setMutating(false)
            return
          }
          const proceed = await new Promise<boolean>((resolve) => {
            setPendingGeofenceResolve(() => (v: boolean) => resolve(v))
            setConfirm({
              visible: true,
              icon: "📏",
              iconColor: "#ef4444",
              title: "Too Far Away",
              message: `You are ${formatDistance(distance)} from ${customer.name}.\nYou need to be within ${GEOFENCE_DEFAULT}m to check in.`,
              confirmText: "Check In Anyway",
              confirmColor: "#ef4444",
              onConfirm: () => {
                setConfirm(c => ({ ...c, visible: false }))
                setPendingGeofenceResolve(null)
                resolve(true)
              },
            })
          })
          if (!proceed) { setMutating(false); return }
          forceCheckIn = true
        }
      }

      const res = await api.checkIn({
        customerId: customer.id,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        ...(forceCheckIn && { force: true }),
      })
      if (res.success) {
        showToast("success", "Checked In", `You are now at ${customer.name}`)
        fetchData()
      } else if (res.error) {
        showToast("error", "Check-in Blocked", res.error)
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") showToast("error", "Error", e.message || "Check-in failed")
    } finally {
      setMutating(false)
    }
  }

  const handleCheckOut = () => {
    if (!activeVisit || mutating) return
    setNotesVisible(true)
  }

  const performCheckOut = async (notes?: string) => {
    if (!activeVisit || mutating) return
    setMutating(true)
    try {
      const coords = await getCoords()
      if (coords === undefined) { setMutating(false); return }
      const res = await api.checkOut(activeVisit.id, {
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        notes: notes || undefined,
      })
      if (res.success) {
        showToast("success", "Checked Out", "Visit completed successfully")
        fetchData()
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") showToast("error", "Error", e.message || "Check-out failed")
    } finally {
      setMutating(false)
    }
  }

  const handlePhotoTaken = async (path: string) => {
    if (!activeVisit) return
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
      await api.uploadPhoto({
        filePath: path,
        visitId: activeVisit.id,
        category: "VISIT",
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      })
      setPhotoCount((c) => c + 1)
      showToast("success", "Photo Saved", "Photo uploaded successfully")
    } catch (e: any) {
      showToast("error", "Upload Failed", e.message || "Could not upload photo")
    }
  }

  const checkedInCount = visits.filter(v => v.status === "CHECKED_IN").length
  const checkedOutCount = visits.filter(v => v.status === "CHECKED_OUT").length
  const avgDuration = visits.filter(v => v.duration).reduce((sum, v) => sum + (v.duration || 0), 0) / Math.max(visits.filter(v => v.duration).length, 1)

  const categoryColor = (cat?: string) => {
    switch (cat) {
      case "A": return "#6C63FF"
      case "B": return "#3b82f6"
      case "C": return "#f59e0b"
      default: return "#94a3b8"
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Visits</Text>
            <Text style={styles.headerSubtitle}>
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          </View>
          {visits.length > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeNum}>{visits.length}</Text>
              <Text style={styles.headerBadgeLabel}>today</Text>
            </View>
          )}
        </View>
      </View>

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{visits.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#22c55e" }]}>{checkedInCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#6C63FF" }]}>{checkedOutCount}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#f59e0b" }]}>
            {avgDuration > 0 ? `${Math.round(avgDuration)}` : "—"}
          </Text>
          <Text style={styles.statLabel}>Avg min</Text>
        </View>
      </View>

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
              style={styles.photoBtn}
              onPress={() => setCameraVisible(true)}
              disabled={mutating}
            >
              <Text style={styles.photoBtnText}>📷 {photoCount}</Text>
            </TouchableOpacity>
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

      {/* Quick check-in */}
      {!activeVisit && customersWithDistance.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Check-in</Text>
            <Text style={styles.sectionCount}>{customersWithDistance.length} nearby</Text>
          </View>

          {/* Search input */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search customers..."
              placeholderTextColor="#94a3b8"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {searchQuery.trim() ? (
            /* Filtered vertical list when searching */
            <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
              {customersWithDistance
                .filter((c) => c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                .map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.searchResultRow, mutating && { opacity: 0.5 }]}
                    onPress={() => handleCheckIn(item)}
                    disabled={mutating}
                  >
                    <View style={[styles.customerAvatar, { backgroundColor: categoryColor(item.category), width: 36, height: 36, borderRadius: 12 }]}>
                      <Text style={[styles.customerInitial, { fontSize: 14 }]}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
                      {item.address && (
                        <Text style={styles.searchResultAddress} numberOfLines={1}>{item.address}</Text>
                      )}
                    </View>
                    {item.distanceMeters != null && (
                      <View style={[styles.distanceTag, { backgroundColor: distanceColor(item.distanceMeters) + "15" }]}>
                        <Text style={[styles.distanceText, { color: distanceColor(item.distanceMeters) }]}>
                          {formatDistance(item.distanceMeters)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              {customersWithDistance.filter((c) => c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).length === 0 && (
                <Text style={styles.noResults}>No customers found</Text>
              )}
            </ScrollView>
          ) : (
            /* Original horizontal scroll of nearest customers */
            <FlatList
              horizontal
              data={customersWithDistance.slice(0, 10)}
              keyExtractor={(c) => c.id}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.customerChip, mutating && { opacity: 0.5 }]}
                  onPress={() => handleCheckIn(item)}
                  disabled={mutating}
                >
                  <View style={[styles.customerAvatar, { backgroundColor: categoryColor(item.category) }]}>
                    <Text style={styles.customerInitial}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  {item.category && (
                    <View style={[styles.categoryBadge, { backgroundColor: categoryColor(item.category) + "20" }]}>
                      <Text style={[styles.categoryText, { color: categoryColor(item.category) }]}>{item.category}</Text>
                    </View>
                  )}
                  <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
                  {item.distanceMeters != null && (
                    <View style={[styles.distanceTag, { backgroundColor: distanceColor(item.distanceMeters) + "15" }]}>
                      <Text style={[styles.distanceText, { color: distanceColor(item.distanceMeters) }]}>
                        {formatDistance(item.distanceMeters)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Recent visits */}
      <View style={styles.sectionHeader2}>
        <Text style={styles.sectionTitle}>Today's Visits</Text>
        <Text style={styles.sectionCount}>{visits.length} visits</Text>
      </View>
      <FlatList
        data={visits}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor="#6C63FF" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {loading ? "Loading..." : "No Visits Today"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {!loading ? "Use Quick Check-in to start your first visit" : "Fetching your visits"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.visitCard, item.status === "CHECKED_IN" && styles.visitCardActive]}>
            <View style={[styles.visitDot, { backgroundColor: item.status === "CHECKED_IN" ? "#22c55e" : "#6C63FF" }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.visitCustomer}>{item.customer?.name || "—"}</Text>
              {item.customer?.address && (
                <Text style={styles.visitAddress} numberOfLines={1}>{item.customer.address}</Text>
              )}
              <Text style={styles.visitTime}>
                {new Date(item.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {item.checkOutAt
                  ? ` → ${new Date(item.checkOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </Text>
            </View>
            <View style={styles.visitRight}>
              {item.status === "CHECKED_IN" ? (
                <View style={styles.liveTag}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : (
                <Text style={styles.visitDuration}>
                  {item.duration ? `${item.duration} min` : "—"}
                </Text>
              )}
            </View>
          </View>
        )}
      />

      {/* Modals */}
      <NotesModal
        visible={notesVisible}
        title="Check Out"
        message="Add notes about this visit (optional):"
        onCancel={() => setNotesVisible(false)}
        onSubmit={(text) => { setNotesVisible(false); performCheckOut(text) }}
      />
      <PhotoCaptureModal
        visible={cameraVisible}
        onClose={() => setCameraVisible(false)}
        onPhotoTaken={handlePhotoTaken}
        watermark={
          api.currentAgent && activeVisit
            ? {
                agent: {
                  id: api.currentAgent.id,
                  name: api.currentAgent.name,
                  code: api.currentAgent.code,
                },
                visit: { id: activeVisit.id },
                customer: {
                  id: activeVisit.customer.id,
                  name: activeVisit.customer.name,
                },
                getLocation: getCoords,
                getLastKnownLocation: () =>
                  lastKnownPosition
                    ? {
                        latitude: lastKnownPosition.latitude,
                        longitude: lastKnownPosition.longitude,
                        capturedAt: new Date(lastKnownPosition.timestamp),
                      }
                    : null,
              }
            : undefined
        }
      />
      <ConfirmSheet
        visible={confirm.visible}
        icon={confirm.icon}
        iconColor={confirm.iconColor}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmText}
        confirmColor={confirm.confirmColor}
        destructive={confirm.destructive}
        onCancel={() => {
          setConfirm(c => ({ ...c, visible: false }))
          if (pendingGeofenceResolve) {
            pendingGeofenceResolve(false)
            setPendingGeofenceResolve(null)
          }
        }}
        onConfirm={confirm.onConfirm}
      />
      <FeedbackToast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
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
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  headerSubtitle: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  headerBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  headerBadgeNum: { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerBadgeLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase" },

  // Stats
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -14,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  statCard: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: "#0B0B1E" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },

  // Active visit
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

  // Sections
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionHeader2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { fontSize: 11, color: "#94a3b8" },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0B0B1E",
    paddingVertical: 0,
    height: 36,
  },
  searchResults: {
    maxHeight: 200,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  searchResultName: { fontSize: 13, fontWeight: "600", color: "#0B0B1E" },
  searchResultAddress: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  noResults: { fontSize: 13, color: "#94a3b8", textAlign: "center", paddingVertical: 16 },

  // Customer chips
  customerChip: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginRight: 10,
    alignItems: "center",
    width: 84,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#f8fafc",
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  customerInitial: { color: "#fff", fontSize: 16, fontWeight: "700" },
  categoryBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  categoryText: { fontSize: 9, fontWeight: "700" },
  customerName: { fontSize: 10, color: "#334155", textAlign: "center", fontWeight: "500" },
  distanceTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  distanceText: { fontSize: 9, fontWeight: "700" },

  // Empty state
  empty: { padding: 40, alignItems: "center" },
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

  // Visit cards
  visitCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
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
  visitCardActive: {
    borderColor: "#86efac",
    backgroundColor: "#fafffe",
  },
  visitDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  visitCustomer: { fontSize: 14, fontWeight: "700", color: "#0B0B1E" },
  visitAddress: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  visitTime: { fontSize: 11, color: "#64748b", marginTop: 4 },
  visitRight: { alignItems: "flex-end" },
  visitDuration: { fontSize: 14, fontWeight: "700", color: "#6C63FF" },
  liveTag: {
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText: { fontSize: 10, fontWeight: "700", color: "#22c55e" },
})
