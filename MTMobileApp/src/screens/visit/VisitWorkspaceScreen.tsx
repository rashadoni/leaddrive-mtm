import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute } from "@react-navigation/native"
import type { RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import {
  toVisitWorkspace,
  type VisitRequirement,
  type VisitWorkspace,
} from "../../services/visit-workspace"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

type LoadState = "loading" | "ready" | "offline" | "error"
type Language = "ru" | "az" | "en"

const COPY = {
  ru: {
    eyebrow: "Итог визита",
    subtitle: "Здесь видно, когда прошёл визит, какой результат сохранён и что было выполнено.",
    back: "Назад",
    loadingTitle: "Загружаем итог визита",
    loadingBody: "Проверяем время, результат и обязательные действия.",
    offlineTitle: "Сейчас нет связи",
    offlineBody: "Показываем уже открытую запись. Обновить её можно после подключения.",
    errorTitle: "Не удалось открыть визит",
    errorBody: "Проверьте интернет и попробуйте снова.",
    retry: "Попробовать снова",
    overview: "Коротко о визите",
    client: "Клиент",
    contact: "Контакт",
    noAddress: "Адрес не указан",
    noContact: "Контакт не выбран",
    noResultTitle: "Результат ещё не заполнен",
    noResultBody: "Для активного визита результат появится после завершения.",
    requirementsProgress: (done: number, total: number) => `Выполнено ${done} из ${total}`,
    complete: "Выполнено",
    waived: "Пропущено с разрешением",
    remaining: "Не выполнено",
    tasksCount: (count: number) => `Задач: ${count}`,
    noTasks: "К этому визиту задачи не привязаны.",
    status: {
      PLANNED: "Запланирован",
      CHECKED_IN: "Идёт сейчас",
      CHECKED_OUT: "Завершён",
      COMPLETED: "Завершён",
      CANCELLED: "Отменён",
    },
    outcome: {
      SUCCESSFUL: "Успешно",
      PARTIAL: "Частично",
      NO_CONTACT: "Контакт не состоялся",
      RESCHEDULE: "Перенесён",
    },
    potential: { HIGH: "Высокий", MEDIUM: "Средний", LOW: "Низкий", UNKNOWN: "Не определён" },
    taskStatus: { PENDING: "К выполнению", IN_PROGRESS: "В работе", COMPLETED: "Готово" },
  },
  az: {
    eyebrow: "Ziyarətin yekunu",
    subtitle: "Ziyarətin vaxtını, saxlanmış nəticəni və tamamlanan addımları burada görün.",
    back: "Geri",
    loadingTitle: "Ziyarətin yekunu yüklənir",
    loadingBody: "Vaxt, nəticə və tələb olunan addımlar yoxlanılır.",
    offlineTitle: "Hazırda bağlantı yoxdur",
    offlineBody: "Açılmış qeyd göstərilir. İnternet gələndə onu yeniləyə bilərsiniz.",
    errorTitle: "Ziyarəti açmaq alınmadı",
    errorBody: "İnterneti yoxlayın və yenidən cəhd edin.",
    retry: "Yenidən cəhd et",
    overview: "Ziyarət haqqında qısa məlumat",
    client: "Müştəri",
    contact: "Kontakt",
    noAddress: "Ünvan göstərilməyib",
    noContact: "Kontakt seçilməyib",
    noResultTitle: "Nəticə hələ yazılmayıb",
    noResultBody: "Aktiv ziyarətin nəticəsi tamamlandıqdan sonra görünəcək.",
    requirementsProgress: (done: number, total: number) => `${total} addımdan ${done}-i tamamlanıb`,
    complete: "Tamamlanıb",
    waived: "İcazə ilə keçilib",
    remaining: "Tamamlanmayıb",
    tasksCount: (count: number) => `Tapşırıq: ${count}`,
    noTasks: "Bu ziyarətə tapşırıq bağlanmayıb.",
    status: {
      PLANNED: "Planlaşdırılıb",
      CHECKED_IN: "İndi davam edir",
      CHECKED_OUT: "Tamamlanıb",
      COMPLETED: "Tamamlanıb",
      CANCELLED: "Ləğv edilib",
    },
    outcome: {
      SUCCESSFUL: "Uğurlu",
      PARTIAL: "Qismən",
      NO_CONTACT: "Görüş baş tutmadı",
      RESCHEDULE: "Başqa vaxta keçirilib",
    },
    potential: { HIGH: "Yüksək", MEDIUM: "Orta", LOW: "Aşağı", UNKNOWN: "Müəyyən edilməyib" },
    taskStatus: { PENDING: "Görüləcək", IN_PROGRESS: "İcrada", COMPLETED: "Tamam" },
  },
  en: {
    eyebrow: "Visit summary",
    subtitle: "See when the visit happened, what result was saved and which steps were completed.",
    back: "Back",
    loadingTitle: "Loading the visit summary",
    loadingBody: "Checking timing, results and required actions.",
    offlineTitle: "You are offline",
    offlineBody: "Showing the record already on screen. Reconnect to refresh it.",
    errorTitle: "We couldn't open this visit",
    errorBody: "Check your connection and try again.",
    retry: "Try again",
    overview: "Visit at a glance",
    client: "Client",
    contact: "Contact",
    noAddress: "No address provided",
    noContact: "No contact selected",
    noResultTitle: "No result has been recorded yet",
    noResultBody: "An active visit will show its result after it is completed.",
    requirementsProgress: (done: number, total: number) => `${done} of ${total} completed`,
    complete: "Completed",
    waived: "Skipped with approval",
    remaining: "Not completed",
    tasksCount: (count: number) => `${count} task${count === 1 ? "" : "s"}`,
    noTasks: "No tasks are linked to this visit.",
    status: {
      PLANNED: "Planned",
      CHECKED_IN: "In progress",
      CHECKED_OUT: "Completed",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    },
    outcome: {
      SUCCESSFUL: "Successful",
      PARTIAL: "Partial",
      NO_CONTACT: "No contact",
      RESCHEDULE: "Rescheduled",
    },
    potential: { HIGH: "High", MEDIUM: "Medium", LOW: "Low", UNKNOWN: "Not set" },
    taskStatus: { PENDING: "To do", IN_PROGRESS: "In progress", COMPLETED: "Done" },
  },
} as const

type Copy = typeof COPY.ru | typeof COPY.az | typeof COPY.en

function languageFor(value: string): Language {
  const language = value.toLowerCase()
  if (language.startsWith("az")) return "az"
  if (language.startsWith("en")) return "en"
  return "ru"
}

function codeLabel(code: string | undefined, labels: Record<string, string>): string {
  if (!code) return "—"
  return labels[code] ?? code.toLowerCase().replace(/_/g, " ").replace(/^./, (value) => value.toUpperCase())
}

function actionLabel(t: (key: string) => string, key: string): string {
  const map: Record<string, string> = {
    PHOTO: "visitWorkspace.actionPhoto",
    PRESENTATION: "visitWorkspace.actionPresentation",
    STOCK_CHECK: "visitWorkspace.actionStockCheck",
    VISIT_NOTE: "visitWorkspace.actionVisitNote",
    CHECKLIST: "visitWorkspace.actionChecklist",
    FEEDBACK: "visitWorkspace.actionFeedback",
    NEXT_ACTION: "visitWorkspace.actionNextAction",
  }
  return map[key] ? t(map[key]) : key
}

function requirementVisual(requirement: VisitRequirement, copy: Copy) {
  if (requirement.done) {
    return {
      icon: "checkmark-circle" as const,
      color: fieldTheme.color.success,
      background: fieldTheme.color.successSoft,
      label: copy.complete,
    }
  }
  if (requirement.waived) {
    return {
      icon: "remove-circle-outline" as const,
      color: fieldTheme.color.amber,
      background: fieldTheme.color.amberSoft,
      label: copy.waived,
    }
  }
  return {
    icon: "ellipse-outline" as const,
    color: fieldTheme.color.inkMuted,
    background: fieldTheme.color.surfaceStrong,
    label: copy.remaining,
  }
}

function visitStatusVisual(status: string) {
  if (status === "CHECKED_IN") {
    return { color: fieldTheme.color.success, background: fieldTheme.color.successSoft, icon: "radio-outline" as const }
  }
  if (status === "CANCELLED") {
    return { color: fieldTheme.color.danger, background: fieldTheme.color.dangerSoft, icon: "close-circle-outline" as const }
  }
  if (status === "PLANNED") {
    return { color: fieldTheme.color.blue, background: fieldTheme.color.blueSoft, icon: "calendar-outline" as const }
  }
  return { color: fieldTheme.color.primary, background: fieldTheme.color.primarySoft, icon: "checkmark-circle-outline" as const }
}

export default function VisitWorkspaceScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "VisitWorkspace">>()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const copy = COPY[languageFor(i18n.language)]
  const { visitId, name } = route.params

  const [data, setData] = useState<VisitWorkspace | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [refreshing, setRefreshing] = useState(false)

  const fetchWorkspace = useCallback(async () => {
    try {
      const response = await api.getVisitWorkspace(visitId)
      if (!response.success || !response.data?.visit) throw new Error("VISIT_WORKSPACE_LOAD_FAILED")
      setData(toVisitWorkspace(response.data.visit))
      setLoadState("ready")
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") {
        setLoadState((current) => current === "ready" || current === "offline" ? "offline" : "error")
      }
    } finally {
      setRefreshing(false)
    }
  }, [visitId])

  useEffect(() => {
    fetchWorkspace()
  }, [fetchWorkspace])

  const refresh = () => {
    setRefreshing(true)
    fetchWorkspace()
  }

  const formatTime = (iso?: string) => {
    if (!iso) return "—"
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString(i18n.language, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const completedRequirements = useMemo(
    () => data?.requirements.filter((requirement) => requirement.done || requirement.waived).length ?? 0,
    [data],
  )
  const title = data?.customer.name || name || copy.eyebrow
  const statusVisual = visitStatusVisual(data?.status ?? "")

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.back}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.backButton,
                { width: touchTarget, height: touchTarget },
                pressed && styles.pressed,
              ]}
            >
              <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
              <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.headerSubtitle}>{copy.subtitle}</Text>
            </View>
            {data ? (
              <View style={[styles.headerStatus, { backgroundColor: statusVisual.background }]}>
                <Icon name={statusVisual.icon} size={18} color={statusVisual.color} />
                <Text style={[styles.headerStatusText, { color: statusVisual.color }]}>
                  {codeLabel(data.status, copy.status)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {loadState === "loading" && !data ? (
        <StatePanel
          icon="reader-outline"
          title={copy.loadingTitle}
          body={copy.loadingBody}
          loading
        />
      ) : loadState === "error" && !data ? (
        <StatePanel
          icon="alert-circle-outline"
          title={copy.errorTitle}
          body={copy.errorBody}
          action={copy.retry}
          onAction={fetchWorkspace}
        />
      ) : data ? (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={fieldTheme.color.primary}
              colors={[fieldTheme.color.primary]}
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, fieldTheme.space.xxl) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {loadState === "offline" ? (
              <Notice
                title={copy.offlineTitle}
                body={copy.offlineBody}
                action={copy.retry}
                busy={refreshing}
                onAction={refresh}
              />
            ) : null}

            <View style={styles.overviewCard}>
              <View style={styles.sectionHeadingRow}>
                <View style={[styles.sectionIcon, { backgroundColor: fieldTheme.color.primarySoft }]}>
                  <Icon name="briefcase-outline" size={22} color={fieldTheme.color.primaryStrong} />
                </View>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionEyebrow}>{copy.overview}</Text>
                  <Text style={styles.sectionTitle}>{data.customer.name || title}</Text>
                </View>
              </View>
              <InfoLine icon="pin-outline" label={copy.client} value={data.customer.address || copy.noAddress} />
              <InfoLine
                icon="person-outline"
                label={copy.contact}
                value={data.contact?.name || copy.noContact}
                secondary={[data.contact?.specialty, data.contact?.phone].filter(Boolean).join(" · ") || undefined}
              />
              <View style={styles.statGrid}>
                <Stat icon="log-in-outline" label={t("visitWorkspace.fieldCheckIn")} value={formatTime(data.checkInAt)} />
                <Stat icon="log-out-outline" label={t("visitWorkspace.fieldCheckOut")} value={formatTime(data.checkOutAt)} />
                <Stat
                  icon="time-outline"
                  label={t("visitWorkspace.fieldDuration")}
                  value={data.duration != null ? t("visitWorkspace.minutesTemplate", { n: data.duration }) : "—"}
                />
                <Stat icon="images-outline" label={t("visitWorkspace.actionPhoto")} value={String(data.photosCount)} />
              </View>
            </View>

            <View style={[styles.columns, tablet && styles.columnsTablet]}>
              <View style={styles.column}>
                <SectionCard icon="flag-outline" title={t("visitWorkspace.sectionResult")}>
                  {data.outcome || data.potential || data.resultNotes || data.notes ? (
                    <>
                      {data.outcome ? (
                        <InfoLine
                          icon="checkmark-done-outline"
                          label={t("visitWorkspace.fieldOutcome")}
                          value={codeLabel(data.outcome, copy.outcome)}
                        />
                      ) : null}
                      {data.potential ? (
                        <InfoLine
                          icon="trending-up-outline"
                          label={t("visitWorkspace.fieldPotential")}
                          value={codeLabel(data.potential, copy.potential)}
                        />
                      ) : null}
                      {data.resultNotes || data.notes ? (
                        <InfoLine
                          icon="document-text-outline"
                          label={t("visitWorkspace.fieldNotes")}
                          value={data.resultNotes || data.notes || "—"}
                        />
                      ) : null}
                    </>
                  ) : (
                    <EmptyBlock icon="create-outline" title={copy.noResultTitle} body={copy.noResultBody} />
                  )}
                </SectionCard>

                <SectionCard
                  icon="checkbox-outline"
                  title={t("visitWorkspace.sectionTasks")}
                  badge={copy.tasksCount(data.tasks.length)}
                >
                  {data.tasks.length > 0 ? data.tasks.map((task) => {
                    const done = task.status === "COMPLETED"
                    return (
                      <View key={task.id} style={styles.taskRow}>
                        <View style={[styles.rowIcon, { backgroundColor: done ? fieldTheme.color.successSoft : fieldTheme.color.blueSoft }]}>
                          <Icon
                            name={done ? "checkmark" : "hourglass-outline"}
                            size={19}
                            color={done ? fieldTheme.color.success : fieldTheme.color.blue}
                          />
                        </View>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <View style={[styles.smallPill, { backgroundColor: done ? fieldTheme.color.successSoft : fieldTheme.color.surfaceStrong }]}>
                          <Text style={[styles.smallPillText, { color: done ? fieldTheme.color.success : fieldTheme.color.inkMuted }]}>
                            {codeLabel(task.status, copy.taskStatus)}
                          </Text>
                        </View>
                      </View>
                    )
                  }) : (
                    <EmptyBlock icon="list-outline" title={copy.noTasks} />
                  )}
                </SectionCard>
              </View>

              <View style={styles.column}>
                <SectionCard
                  icon="shield-checkmark-outline"
                  title={t("visitWorkspace.sectionRequirements")}
                  badge={copy.requirementsProgress(completedRequirements, data.requirements.length)}
                >
                  {data.requirements.length > 0 ? (
                    <>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.round((completedRequirements / data.requirements.length) * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.requirementList}>
                        {data.requirements.map((requirement) => {
                          const visual = requirementVisual(requirement, copy)
                          return (
                            <View key={requirement.actionKey} style={styles.requirementRow}>
                              <View style={[styles.rowIcon, { backgroundColor: visual.background }]}>
                                <Icon name={visual.icon} size={20} color={visual.color} />
                              </View>
                              <View style={styles.requirementCopy}>
                                <Text style={styles.requirementTitle}>{actionLabel(t, requirement.actionKey)}</Text>
                                <Text style={[styles.requirementStatus, { color: visual.color }]}>{visual.label}</Text>
                              </View>
                              <Text style={styles.requirementMode}>
                                {requirement.mode === "REQUIRED"
                                  ? t("visitWorkspace.reqRequired")
                                  : t("visitWorkspace.reqOptional")}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    </>
                  ) : (
                    <EmptyBlock icon="shield-checkmark-outline" title={t("visitWorkspace.noRequirements")} />
                  )}
                </SectionCard>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : null}
    </View>
  )
}

function Notice({ title, body, action, busy, onAction }: {
  title: string
  body: string
  action: string
  busy: boolean
  onAction: () => void
}) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Icon name="cloud-offline-outline" size={23} color={fieldTheme.color.amber} />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onAction}
        style={({ pressed }) => [styles.noticeButton, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator size="small" color={fieldTheme.color.amber} /> : <Text style={styles.noticeButtonText}>{action}</Text>}
      </Pressable>
    </View>
  )
}

function StatePanel({ icon, title, body, loading = false, action, onAction }: {
  icon: string
  title: string
  body: string
  loading?: boolean
  action?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.statePanel} accessibilityLiveRegion="polite">
      <View style={styles.stateIcon}>
        {loading
          ? <ActivityIndicator size="large" color={fieldTheme.color.primary} />
          : <Icon name={icon} size={34} color={fieldTheme.color.primary} />}
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}>
          <Icon name="refresh" size={19} color={fieldTheme.color.onColor} />
          <Text style={styles.stateButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function SectionCard({ icon, title, badge, children }: {
  icon: string
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.cardHeading}>
        <View style={styles.cardHeadingIcon}><Icon name={icon} size={21} color={fieldTheme.color.primaryStrong} /></View>
        <Text style={styles.cardTitle}>{title}</Text>
        {badge ? <View style={styles.cardBadge}><Text style={styles.cardBadgeText}>{badge}</Text></View> : null}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  )
}

function InfoLine({ icon, label, value, secondary }: {
  icon: string
  label: string
  value: string
  secondary?: string
}) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoIcon}><Icon name={icon} size={19} color={fieldTheme.color.primaryStrong} /></View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
        {secondary ? <Text style={styles.infoSecondary}>{secondary}</Text> : null}
      </View>
    </View>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={19} color={fieldTheme.color.blue} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function EmptyBlock({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <View style={styles.emptyBlock}>
      <View style={styles.emptyIcon}><Icon name={icon} size={24} color={fieldTheme.color.inkMuted} /></View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl },
  headerInner: { width: "100%", maxWidth: 1180, alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  backButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#BBD6CB", fontSize: 12, lineHeight: 16, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 26, lineHeight: 32, fontWeight: "900", marginTop: 2 },
  headerSubtitle: { color: "#D7E9E1", fontSize: 13, lineHeight: 19, marginTop: fieldTheme.space.xs, maxWidth: 720 },
  headerStatus: { minHeight: 38, maxWidth: 150, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.xs, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.md },
  headerStatusText: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: "900", textAlign: "center" },
  scrollContent: { paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.lg },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", gap: fieldTheme.space.lg },
  notice: { minHeight: 76, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: fieldTheme.space.md, borderWidth: 1, borderColor: "#E8D69F", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft, padding: fieldTheme.space.md },
  noticeCopy: { flex: 1, minWidth: 190 },
  noticeTitle: { color: fieldTheme.color.amber, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  noticeButton: { minHeight: 44, minWidth: 116, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.md },
  noticeButtonText: { color: fieldTheme.color.amber, fontSize: 12, fontWeight: "900" },
  overviewCard: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.xl },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  sectionIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  sectionHeadingCopy: { flex: 1 },
  sectionEyebrow: { color: fieldTheme.color.primaryStrong, fontSize: 11, lineHeight: 15, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 25, fontWeight: "900", marginTop: 2 },
  infoLine: { minHeight: 58, flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingTop: fieldTheme.space.md, marginTop: fieldTheme.space.md },
  infoIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: fieldTheme.color.surfaceStrong },
  infoCopy: { flex: 1 },
  infoLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "800" },
  infoValue: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20, fontWeight: "800", marginTop: 2 },
  infoSecondary: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  stat: { minWidth: 150, flex: 1, flexBasis: 180, minHeight: 98, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft, padding: fieldTheme.space.md },
  statLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: fieldTheme.space.sm },
  statValue: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900", marginTop: 2 },
  columns: { gap: fieldTheme.space.lg },
  columnsTablet: { flexDirection: "row", alignItems: "flex-start" },
  column: { flex: 1, gap: fieldTheme.space.lg, minWidth: 0 },
  sectionCard: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, overflow: "hidden" },
  cardHeading: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.lg, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  cardHeadingIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: fieldTheme.color.primarySoft },
  cardTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  cardBadge: { minHeight: 30, maxWidth: 150, justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong, paddingHorizontal: fieldTheme.space.sm },
  cardBadgeText: { color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 14, fontWeight: "900", textAlign: "center" },
  cardBody: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.lg },
  progressTrack: { height: 9, borderRadius: 5, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden", marginTop: fieldTheme.space.lg },
  progressFill: { height: 9, borderRadius: 5, backgroundColor: fieldTheme.color.success },
  requirementList: { marginTop: fieldTheme.space.sm },
  requirementRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingVertical: fieldTheme.space.sm },
  rowIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  requirementCopy: { flex: 1, minWidth: 0 },
  requirementTitle: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  requirementStatus: { fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 2 },
  requirementMode: { maxWidth: 88, color: fieldTheme.color.inkMuted, fontSize: 9, lineHeight: 13, fontWeight: "900", textTransform: "uppercase", textAlign: "right" },
  taskRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingVertical: fieldTheme.space.sm },
  taskTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  smallPill: { minHeight: 28, maxWidth: 100, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm },
  smallPillText: { fontSize: 9, lineHeight: 12, fontWeight: "900", textAlign: "center" },
  emptyBlock: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.lg },
  emptyIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: fieldTheme.color.surfaceStrong },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  statePanel: { flex: 1, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xxl },
  stateIcon: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: fieldTheme.color.primarySoft },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 19, lineHeight: 24, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.lg },
  stateBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 420, marginTop: fieldTheme.space.sm },
  stateButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.xl, marginTop: fieldTheme.space.lg },
  stateButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.72 },
})
