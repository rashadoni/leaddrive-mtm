import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { toRouteContactDetail, type RouteContactDetail } from "../../services/route-contact-detail"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

type Language = "ru" | "az" | "en"
type DetailRow = { icon: string; label: string; value: string | undefined }

const COPY = {
  ru: {
    back: "Назад",
    eyebrow: "Контакт маршрута",
    loading: "Открываем контакт",
    loadingBody: "Загружаем только данные для работы с маршрутом.",
    error: "Не удалось открыть контакт",
    errorBody: "Проверьте соединение и повторите попытку.",
    retry: "Повторить",
    profile: "Основные данные",
    workplace: "Места работы",
    contacts: "Связаться",
    noWorkplace: "Места работы не указаны.",
    noContacts: "Контактные данные не указаны.",
    phone: "Позвонить",
    specialty: "Специальность",
    type: "Тип",
    category: "Категория",
    status: "Статус",
    jobTitle: "Должность",
    primary: "Основное",
    unknown: "Не указано",
    routeOnly: "Это приложение показывает только маршрутные данные. Управление персоналом и коммерческие операции доступны в отдельных продуктах.",
  },
  az: {
    back: "Geri",
    eyebrow: "Marşrut kontaktı",
    loading: "Kontakt açılır",
    loadingBody: "Yalnız marşrut işi üçün məlumatlar yüklənir.",
    error: "Kontaktı açmaq alınmadı",
    errorBody: "Bağlantını yoxlayın və yenidən cəhd edin.",
    retry: "Yenidən cəhd et",
    profile: "Əsas məlumatlar",
    workplace: "İş yerləri",
    contacts: "Əlaqə saxla",
    noWorkplace: "İş yeri göstərilməyib.",
    noContacts: "Əlaqə məlumatı göstərilməyib.",
    phone: "Zəng et",
    specialty: "İxtisas",
    type: "Növ",
    category: "Kateqoriya",
    status: "Status",
    jobTitle: "Vəzifə",
    primary: "Əsas",
    unknown: "Göstərilməyib",
    routeOnly: "Bu tətbiq yalnız marşrut məlumatlarını göstərir. HRM və kommersiya əməliyyatları ayrı məhsullarda mövcuddur.",
  },
  en: {
    back: "Back",
    eyebrow: "Route contact",
    loading: "Opening contact",
    loadingBody: "Loading only the information needed for route work.",
    error: "We couldn't open this contact",
    errorBody: "Check your connection and try again.",
    retry: "Try again",
    profile: "Essentials",
    workplace: "Workplaces",
    contacts: "Contact",
    noWorkplace: "No workplace is provided.",
    noContacts: "No contact details are provided.",
    phone: "Call",
    specialty: "Specialty",
    type: "Type",
    category: "Category",
    status: "Status",
    jobTitle: "Job title",
    primary: "Primary",
    unknown: "Not provided",
    routeOnly: "This app shows route information only. Workforce and commercial operations live in separate products.",
  },
} as const

function languageFor(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function firstPhone(detail: RouteContactDetail): string | undefined {
  return detail.workplaces.find((workplace) => workplace.isPrimary && workplace.phone)?.phone
    || detail.workplaces.find((workplace) => workplace.phone)?.phone
}

function workplaceAddress(detail: RouteContactDetail["workplaces"][number]): string | undefined {
  return [detail.address, detail.city]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ") || undefined
}

function ContactRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Icon name={icon} size={18} color={fieldTheme.color.primaryStrong} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  )
}

export default function RouteContactDetailScreen() {
  const { i18n } = useTranslation()
  const copy = COPY[languageFor(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "ContactDetail">>()
  const headerTop = useHeaderTop()
  const { width } = useWindowDimensions()
  const tablet = isExpandedTabletWidth(width)
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const { id, name } = route.params
  const [detail, setDetail] = useState<RouteContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const response = await api.getRouteContactDetail(id)
      if (!response?.success || !response.data?.contact) throw new Error("CONTACT_NOT_FOUND")
      setDetail(toRouteContactDetail(response.data.contact))
      setFailed(false)
    } catch (error: any) {
      if (error?.message === "SESSION_EXPIRED") return
      // Deliberately do not read the legacy v1 offline detail here. It stores
      // a broad payload (PII, assignment and commercial state) that the Route
      // Field v2 contract is not allowed to re-expose. A narrow offline cache
      // will arrive as its own stream/cursor slice.
      setFailed(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const phone = detail ? firstPhone(detail) : undefined
  const details = useMemo<Array<[string, string, string]>>(() => {
    if (!detail) return []
    const rows: DetailRow[] = [
      { icon: "medkit-outline", label: copy.specialty, value: detail.specialty },
      { icon: "person-outline", label: copy.type, value: detail.type },
      { icon: "pricetag-outline", label: copy.category, value: detail.category },
      { icon: "shield-checkmark-outline", label: copy.status, value: detail.status },
    ]
    return rows.flatMap(({ icon, label, value }) => value?.trim() ? [[icon, label, value] as [string, string, string]] : [])
  }, [copy, detail])

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.back}
          style={({ pressed }) => [styles.backButton, { minHeight: touchTarget }, pressed && styles.pressed]}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={21} color={fieldTheme.color.onColor} />
          <Text style={styles.backText}>{copy.back}</Text>
        </Pressable>
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.title} numberOfLines={2}>{detail?.name || name || "—"}</Text>
        {detail?.specialty ? <Text style={styles.subtitle}>{detail.specialty}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={fieldTheme.color.primaryStrong} />
          <Text style={styles.stateTitle}>{copy.loading}</Text>
          <Text style={styles.stateBody}>{copy.loadingBody}</Text>
        </View>
      ) : failed || !detail ? (
        <View style={styles.centerState}>
          <Icon name="cloud-offline-outline" size={34} color={fieldTheme.color.inkMuted} />
          <Text style={styles.stateTitle}>{copy.error}</Text>
          <Text style={styles.stateBody}>{copy.errorBody}</Text>
          <Pressable style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]} onPress={() => void load(true)}>
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, tablet && styles.scrollTablet]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={fieldTheme.color.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.boundaryNotice}><Icon name="navigate-circle-outline" size={20} color={fieldTheme.color.primaryStrong} /><Text style={styles.boundaryText}>{copy.routeOnly}</Text></View>

          <Section title={copy.profile}>
            {details.length > 0 ? details.map(([icon, label, value]) => <ContactRow key={label} icon={icon} label={label} value={value} />) : <Empty label={copy.unknown} />}
          </Section>

          <Section title={copy.contacts}>
            {phone ? <ActionRow icon="call-outline" label={copy.phone} value={phone} touchTarget={touchTarget} onPress={() => void Linking.openURL(`tel:${phone}`).catch(() => {})} /> : null}
            {!phone ? <Empty label={copy.noContacts} /> : null}
          </Section>

          <Section title={copy.workplace}>
            {detail.workplaces.length > 0 ? detail.workplaces.map((workplace) => (
              <View key={workplace.id} style={styles.workplace}>
                <View style={styles.workplaceIcon}><Icon name="business-outline" size={20} color={fieldTheme.color.primaryStrong} /></View>
                <View style={styles.workplaceCopy}>
                  <View style={styles.workplaceTitleRow}>
                    <Text style={styles.workplaceTitle}>{workplace.name || copy.unknown}</Text>
                    {workplace.isPrimary ? <Text style={styles.primaryPill}>{copy.primary}</Text> : null}
                  </View>
                  {workplace.jobTitle ? <Text style={styles.workplaceMeta}>{copy.jobTitle}: {workplace.jobTitle}</Text> : null}
                  {workplaceAddress(workplace) ? <Text style={styles.workplaceMeta}>{workplaceAddress(workplace)}</Text> : null}
                  {workplace.phone ? <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`tel:${workplace.phone}`).catch(() => {})}><Text style={styles.phoneLink}>{workplace.phone}</Text></Pressable> : null}
                </View>
              </View>
            )) : <Empty label={copy.noWorkplace} />}
          </Section>
        </ScrollView>
      )}
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>
}

function Empty({ label }: { label: string }) {
  return <Text style={styles.empty}>{label}</Text>
}

function ActionRow({ icon, label, value, touchTarget, onPress }: { icon: string; label: string; value: string; touchTarget: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionRow, { minHeight: touchTarget }, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.rowIcon}><Icon name={icon} size={18} color={fieldTheme.color.primaryStrong} /></View>
      <View style={styles.rowCopy}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.actionValue}>{value}</Text></View>
      <Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl, backgroundColor: fieldTheme.color.primaryStrong },
  backButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingRight: fieldTheme.space.md },
  backText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
  eyebrow: { color: fieldTheme.color.primarySoft, fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginTop: fieldTheme.space.lg },
  title: { color: fieldTheme.color.onColor, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 5 },
  subtitle: { color: fieldTheme.color.primarySoft, fontSize: 14, lineHeight: 20, marginTop: 4 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.xl },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.sm },
  stateBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { marginTop: fieldTheme.space.md, minHeight: 44, justifyContent: "center", paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontWeight: "900" },
  scroll: { padding: fieldTheme.space.lg, gap: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xxl },
  scrollTablet: { alignSelf: "center", width: "100%", maxWidth: 820 },
  boundaryNotice: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  boundaryText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  section: { gap: fieldTheme.space.sm },
  sectionTitle: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  card: { gap: 1, overflow: "hidden", borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  row: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface },
  rowIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: fieldTheme.color.primarySoft },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  rowValue: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "800", marginTop: 2 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface },
  actionValue: { color: fieldTheme.color.primaryStrong, fontSize: 15, lineHeight: 20, fontWeight: "900", marginTop: 2 },
  workplace: { minHeight: 78, flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, padding: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface },
  workplaceIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: fieldTheme.color.primarySoft },
  workplaceCopy: { flex: 1, minWidth: 0 },
  workplaceTitleRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  workplaceTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  primaryPill: { color: fieldTheme.color.primaryStrong, backgroundColor: fieldTheme.color.primarySoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" },
  workplaceMeta: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  phoneLink: { color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 18, fontWeight: "900", marginTop: 5 },
  empty: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, padding: fieldTheme.space.md },
  pressed: { opacity: 0.72 },
})
