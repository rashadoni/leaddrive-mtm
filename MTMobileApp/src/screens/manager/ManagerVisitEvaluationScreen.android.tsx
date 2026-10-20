import React, { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { managerApi } from "../../services/manager-api"
import { notify } from "../../services/app-feedback"
import {
  EVALUATION_COMMENT_MAX,
  EVALUATION_CRITERIA,
  formatScore,
  jointVisitFailure,
  scoresAverage,
  visitTitle,
  type EvaluationCriterion,
  type EvaluationScores,
  type JointVisitFailure,
} from "../../services/joint-visit"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

const FAILURE_COPY: Record<Exclude<JointVisitFailure, "session">, string> = {
  offline: "jointVisit.errorOffline",
  notInTeam: "jointVisit.errorNotInTeam",
  notJoint: "jointVisit.errorNotJoint",
  closed: "jointVisit.errorClosed",
  invalid: "jointVisit.errorInvalid",
  failed: "jointVisit.errorFailed",
}

const SCALE = [1, 2, 3, 4, 5] as const

/**
 * «Оценка агента» (owner-approved mockup, 2026-10-20): six points, 1 — poor,
 * 5 — excellent; a point that did not come up on the visit is left out, and a
 * second tap on a number takes it back. A comment. Given during the visit or
 * after it, changed until the end of the next day. The agent does not see it.
 */
export default function ManagerVisitEvaluationScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, "ManagerVisitEvaluation">>()
  const visit = route.params.visit
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const [scores, setScores] = useState<EvaluationScores>(() => ({ ...(visit.evaluation?.scores ?? {}) }))
  const [comment, setComment] = useState(visit.evaluation?.comment ?? "")
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<JointVisitFailure | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const toggle = (criterion: EvaluationCriterion, score: number) => {
    setFailure(null)
    setScores((current) => {
      const next = { ...current }
      if (next[criterion] === score) delete next[criterion]
      else next[criterion] = score
      return next
    })
  }

  const rated = EVALUATION_CRITERIA.filter((criterion) => typeof scores[criterion] === "number")
  const average = scoresAverage(scores)
  const canSave = rated.length > 0 && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setFailure(null)
    try {
      await managerApi.saveVisitEvaluation(visit.id, {
        scores: Object.fromEntries(rated.map((criterion) => [criterion, scores[criterion] as number])),
        comment: comment.trim() || null,
      })
      if (!alive.current) return
      notify({ tone: "success", title: t("jointVisit.saved") })
      navigation.goBack()
    } catch (error) {
      if (alive.current) setFailure(jointVisitFailure(error))
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  const failureText = failure && failure !== "session" ? t(FAILURE_COPY[failure]) : null

  // Android 16 does not shrink the window for the keyboard: "padding" keeps
  // «Сохранить оценку» above it while the comment is typed (as on «Написать команде»).
  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <LightScreenStatusBar />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("jointVisit.back")} onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={22} color={fieldTheme.color.ink} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow} numberOfLines={1}>{t("jointVisit.evalEyebrow", { name: visit.agent.name })}</Text>
              <Text style={styles.title} numberOfLines={2}>{visitTitle(visit)}</Text>
            </View>
          </View>
          <Text style={styles.body}>{t("jointVisit.evalHint")}</Text>
        </View>

        <View style={[styles.content, tablet && styles.contentTablet]}>
          <View style={styles.card} testID="manager-visit-evaluation-criteria">
            {EVALUATION_CRITERIA.map((criterion, index) => {
              const label = t(`jointVisit.criteria.${criterion}`)
              return (
                <View key={criterion} style={[styles.criterion, index > 0 && styles.criterionDivider]}>
                  <Text style={styles.criterionLabel}>{label}</Text>
                  <View style={styles.scale}>
                    {SCALE.map((score) => {
                      const on = scores[criterion] === score
                      return (
                        <Pressable
                          key={score}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={t("jointVisit.scoreA11y", { criterion: label, score })}
                          testID={`manager-visit-evaluation-${criterion}-${score}`}
                          hitSlop={4}
                          onPress={() => toggle(criterion, score)}
                          style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{score}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              )
            })}
          </View>

          <View style={styles.averageRow}>
            {average !== null ? (
              <>
                <Text style={styles.averageLabel}>{t("jointVisit.average", { count: rated.length })}</Text>
                <Text style={styles.averageValue} testID="manager-visit-evaluation-average">
                  {formatScore(average, i18n.language)} <Text style={styles.averageOf}>{t("jointVisit.outOfFive")}</Text>
                </Text>
              </>
            ) : (
              <Text style={styles.averageLabel}>{t("jointVisit.noScoreYet")}</Text>
            )}
          </View>

          <Text style={styles.label}>{t("jointVisit.comment")}</Text>
          <TextInput
            testID="manager-visit-evaluation-comment"
            value={comment}
            onChangeText={(value) => { setFailure(null); setComment(value) }}
            multiline
            maxLength={EVALUATION_COMMENT_MAX}
            placeholder={t("jointVisit.commentPlaceholder")}
            placeholderTextColor={fieldTheme.color.inkMuted}
            style={styles.input}
          />
          <View style={styles.note}>
            <Icon name="eye-off-outline" size={16} color={fieldTheme.color.inkMuted} />
            <Text style={styles.noteText}>{t("jointVisit.agentDoesNotSee")}</Text>
          </View>

          {failureText ? (
            <View style={styles.error} accessibilityLiveRegion="polite" testID="manager-visit-evaluation-error">
              <Icon name={failure === "offline" ? "cloud-offline-outline" : "alert-circle-outline"} size={20} color={fieldTheme.color.danger} />
              <Text style={styles.errorText}>{failureText}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.lg) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave, busy: saving }}
          testID="manager-visit-evaluation-save"
          disabled={!canSave}
          onPress={() => { save().catch(() => {}) }}
          style={({ pressed }) => [styles.primary, !canSave && styles.primaryDisabled, pressed && styles.pressed]}
        >
          {saving ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : null}
          <Text style={[styles.primaryText, !canSave && !saving && styles.primaryTextDisabled]}>
            {saving ? t("jointVisit.saving") : rated.length === 0 ? t("jointVisit.chooseFirst") : t("jointVisit.save")}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  page: { flexGrow: 1 },
  header: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.md, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  headerRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.surfaceStrong },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "500" },
  title: { color: fieldTheme.color.ink, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  body: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: fieldTheme.space.sm },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: fieldTheme.space.lg },
  contentTablet: { padding: fieldTheme.space.xl },
  card: { ...fieldTheme.card, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg },
  criterion: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingVertical: 10 },
  criterionDivider: { borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  criterionLabel: { flex: 1, minWidth: 0, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 18, fontWeight: "600" },
  scale: { flexDirection: "row", gap: 5 },
  chip: { width: 36, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1.5, borderColor: fieldTheme.color.line, backgroundColor: fieldTheme.color.surface },
  chipOn: { borderWidth: 2.5, borderColor: fieldTheme.color.primary },
  chipText: { color: fieldTheme.color.inkMuted, fontSize: 15, fontWeight: "600" },
  chipTextOn: { color: fieldTheme.color.primaryStrong, fontWeight: "800" },
  averageRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md, marginHorizontal: 2 },
  averageLabel: { flexShrink: 1, color: fieldTheme.color.inkMuted, fontSize: 14 },
  averageValue: { color: fieldTheme.color.ink, fontSize: 22, fontWeight: "700" },
  averageOf: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "400" },
  label: { color: fieldTheme.color.inkMuted, fontSize: 13, marginTop: fieldTheme.space.lg, marginBottom: fieldTheme.space.sm, marginHorizontal: 2 },
  input: { minHeight: 96, padding: fieldTheme.space.md, borderRadius: 14, borderWidth: 1.5, borderColor: fieldTheme.color.line, backgroundColor: fieldTheme.color.surface, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, textAlignVertical: "top" },
  note: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: fieldTheme.space.sm, marginHorizontal: 2 },
  noteText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12.5 },
  error: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: 14, borderLeftWidth: 4, borderLeftColor: fieldTheme.color.danger, backgroundColor: fieldTheme.color.surface },
  errorText: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19 },
  footer: { paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas },
  primary: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: fieldTheme.space.md, borderRadius: 16, backgroundColor: fieldTheme.color.primaryStrong },
  primaryDisabled: { backgroundColor: fieldTheme.color.surfaceStrong },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "700" },
  primaryTextDisabled: { color: fieldTheme.color.inkMuted },
  pressed: { opacity: 0.78 },
}))
