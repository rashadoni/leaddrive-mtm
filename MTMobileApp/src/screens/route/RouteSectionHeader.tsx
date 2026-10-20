import React, { createContext, useContext } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import NotificationBell from "../../components/NotificationBell"
import { fieldTheme, themed } from "../../theme/fieldTheme"

/**
 * «Маршрут» with the calendar inside it (owner, 2026-10-20: «визиты это также
 * важный раздел… надо на список нижних меню добавить»; mockup approved with
 * «Давай, делай по этому макету»). The agent's sixth tab went to «Визиты», so
 * the month moved under the route: «Сегодня» is today's route, «Месяц» the
 * calendar that was its own tab. Both share this header, and «+ Составить
 * маршрут» sits in it where the grey «+» used to open visits.
 */
export type RouteSectionView = "today" | "month"

export type RouteSection = { view: RouteSectionView; show: (view: RouteSectionView) => void }

const RouteSectionContext = createContext<RouteSection | null>(null)

export const RouteSectionProvider = RouteSectionContext.Provider

/** The tab's switch, or null where the screen stands on its own. */
export function useRouteSection(): RouteSection | null {
  return useContext(RouteSectionContext)
}

const VIEWS: RouteSectionView[] = ["today", "month"]

export default function RouteSectionHeader({
  subtitle,
  headerTop,
  onPlan,
  children,
}: {
  subtitle: string
  headerTop: number
  /** Opens the planner; without it (no own routes for this agent) there is no button. */
  onPlan?: () => void
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const section = useRouteSection()
  return (
    <View style={[styles.header, { paddingTop: headerTop }, section && styles.headerWithTabs]}>
      <View style={styles.titleRow}>
        {/* «+ Составить маршрут» and the bell leave the title about 110 dp on
            a 360 dp phone: one line that shrinks, never a word cut in two. */}
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {t("routeSection.title")}
        </Text>
        {onPlan ? (
          <Pressable
            testID="route-section-plan"
            accessibilityRole="button"
            accessibilityLabel={t("routeSection.plan")}
            accessibilityHint={t("routeSection.planHint")}
            onPress={onPlan}
            style={({ pressed }) => [styles.plan, pressed && styles.pressed]}
          >
            <Icon name="add" size={20} color={fieldTheme.color.onColor} />
            <Text style={styles.planText} numberOfLines={1}>{t("routeSection.plan")}</Text>
          </Pressable>
        ) : null}
        <NotificationBell />
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {children}
      {section ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {VIEWS.map((view) => {
            const active = section.view === view
            return (
              <Pressable
                key={view}
                testID={`route-section-tab-${view}`}
                // «tab», not «button»: the month's day cells are the buttons with a selected state.
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => section.show(view)}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(`routeSection.${view}`)}</Text>
                <View style={[styles.tabLine, active && styles.tabLineActive]} />
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  // White like every tab's header (owner-approved colours, 2026-10-18).
  header: {
    backgroundColor: fieldTheme.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: fieldTheme.color.border,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.lg,
  },
  // The tabs' line lies on the header's edge.
  headerWithTabs: { paddingBottom: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  title: { flex: 1, color: fieldTheme.color.ink, fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.6 },
  subtitle: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  // The screen's one filled button, as the owner asked: «кнопку сделай видным заметным».
  plan: {
    flexShrink: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.xs,
    paddingLeft: fieldTheme.space.md,
    paddingRight: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primaryStrong,
    shadowColor: fieldTheme.color.ink,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  planText: { flexShrink: 1, color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: fieldTheme.space.xl, marginTop: fieldTheme.space.md },
  tab: { minHeight: 44, justifyContent: "flex-end" },
  tabText: { color: fieldTheme.color.inkMuted, fontSize: 16, lineHeight: 22, fontWeight: "500", paddingBottom: fieldTheme.space.sm },
  tabTextActive: { color: fieldTheme.color.ink, fontWeight: "700" },
  tabLine: { height: 3, borderRadius: 2, backgroundColor: "transparent" },
  tabLineActive: { backgroundColor: fieldTheme.color.primary },
  pressed: { opacity: 0.82 },
}))
