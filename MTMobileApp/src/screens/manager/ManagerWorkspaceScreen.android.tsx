import React, { useEffect, useState } from "react"
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"
import { api } from "../../services/api"

export type ManagerWorkspaceKind = "team" | "planning" | "approvals"

const SCREEN_META: Record<
  ManagerWorkspaceKind,
  { titleKey: string; bodyKey: string; icon: string; color: string; tint: string }
> = {
  team: {
    titleKey: "managerShell.teamTitle",
    bodyKey: "managerShell.teamBody",
    icon: "people",
    color: fieldTheme.color.primary,
    tint: fieldTheme.color.primarySoft,
  },
  planning: {
    titleKey: "managerShell.planningTitle",
    bodyKey: "managerShell.planningBody",
    icon: "calendar",
    color: fieldTheme.color.blue,
    tint: fieldTheme.color.blueSoft,
  },
  approvals: {
    titleKey: "managerShell.approvalsTitle",
    bodyKey: "managerShell.approvalsBody",
    icon: "shield-checkmark",
    color: fieldTheme.color.amber,
    tint: fieldTheme.color.amberSoft,
  },
}

export default function ManagerWorkspaceScreen({ kind }: { kind: ManagerWorkspaceKind }) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const meta = SCREEN_META[kind]
  const tablet = isTabletWidth(width)
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string; isOnline: boolean; workday: { status: string } | null }>>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const request = kind === "team" ? api.getManagerTeam(controller.signal) : kind === "planning" ? api.getManagerPlanning(undefined, controller.signal) : api.getManagerApprovals(controller.signal)
    request.then((response: any) => {
        if (kind === "team") setTeam(response?.data?.agents || [])
        else if (kind === "planning") setSummary(`${response?.data?.routes?.length || 0} routes planned today`)
        else setSummary(`${Object.values(response?.data?.counts || {}).reduce((a: number, b: any) => a + Number(b || 0), 0)} approvals pending`)
      })
      .catch(() => setTeam([]))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [kind])

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={[styles.headerInner, tablet && styles.headerInnerTablet]}>
          <View style={[styles.icon, { backgroundColor: meta.tint }]}>
            <Icon name={meta.icon} size={28} color={meta.color} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t("dashboardV2.managerWorkspace")}</Text>
            <Text style={styles.title}>{t(meta.titleKey)}</Text>
            <Text style={styles.body}>{t(meta.bodyKey)}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]}>
        {kind === "team" && !loading && team.length > 0 ? (
          <View style={styles.teamList}>
            {team.map((agent) => (
              <View key={agent.id} style={styles.agentRow}>
                <View style={[styles.presenceDot, { backgroundColor: agent.isOnline ? fieldTheme.color.success : fieldTheme.color.border }]} />
                <View style={styles.agentCopy}>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Text style={styles.agentMeta}>{agent.role} · {agent.workday?.status || t("dashboardV2.unavailable")}</Text>
                </View>
                <Text style={styles.agentState}>{agent.isOnline ? "ONLINE" : "OFFLINE"}</Text>
              </View>
            ))}
          </View>
        ) : !loading && summary ? <View style={styles.statusPanel}>
          <View style={styles.statusIcon}><Icon name={kind === "planning" ? "calendar-outline" : "checkmark-done-outline"} size={22} color={meta.color} /></View>
          <View style={styles.statusCopy}><Text style={styles.statusTitle}>{summary}</Text><Text style={styles.statusBody}>{t(meta.bodyKey)}</Text></View>
        </View> : <View style={styles.statusPanel}>
          <View style={styles.statusIcon}>
            <Icon name="git-branch-outline" size={22} color={fieldTheme.color.primary} />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{t("dashboardV2.unavailable")}</Text>
            <Text style={styles.statusBody}>{t("managerShell.pendingApi")}</Text>
          </View>
        </View>}

        <View style={[styles.skeletonGrid, tablet && styles.skeletonGridTablet]}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.skeleton, tablet && styles.skeletonTablet]}>
              <View style={[styles.skeletonDot, { backgroundColor: meta.tint }]} />
              <View style={styles.skeletonLineStrong} />
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: {
    backgroundColor: fieldTheme.color.surface,
    borderBottomColor: fieldTheme.color.border,
    borderBottomWidth: 1,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.xl,
  },
  headerInner: { gap: fieldTheme.space.lg },
  headerInnerTablet: {
    // Content cap, not a viewport breakpoint: keep copy comfortably wide on
    // expanded tablets while the shared 840dp helper decides when this row is used.
    maxWidth: 960,
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: fieldTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, gap: fieldTheme.space.xs },
  eyebrow: {
    color: fieldTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: { color: fieldTheme.color.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.7 },
  body: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, maxWidth: 680 },
  content: { padding: fieldTheme.space.lg, gap: fieldTheme.space.xl },
  contentTablet: { padding: fieldTheme.space.xl, maxWidth: 1180 },
  statusPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "800" },
  statusBody: { color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 19 },
  teamList: { gap: fieldTheme.space.sm },
  agentRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  presenceDot: { width: 10, height: 10, borderRadius: fieldTheme.radius.pill },
  agentCopy: { flex: 1, gap: 2 },
  agentName: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  agentMeta: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  agentState: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "800" },
  skeletonGrid: { gap: fieldTheme.space.md },
  skeletonGridTablet: { flexDirection: "row", flexWrap: "wrap" },
  skeleton: {
    minHeight: 154,
    padding: fieldTheme.space.lg,
    gap: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  skeletonTablet: { width: "48%" },
  skeletonDot: { width: 38, height: 38, borderRadius: fieldTheme.radius.md },
  skeletonLineStrong: {
    height: 14,
    width: "62%",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  skeletonLine: {
    height: 9,
    width: "88%",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  skeletonLineShort: { width: "46%" },
})
