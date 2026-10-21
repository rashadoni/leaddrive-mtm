import React, { useCallback, useEffect, useRef, useState } from "react"
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import TapIcon from "react-native-vector-icons/MaterialCommunityIcons"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { guideDue, useGuideStore, type GuideRun } from "../../store/guide"
import { offlineScopeKey } from "../../services/offline-scope"
import { hasOfficeAttendanceAccess } from "../../services/attendance-access"
import { mainShell } from "../../navigation/role-tabs"
import { currentRouteName, openGuideScreen } from "../../navigation/navigation-ref"
import {
  GUIDE_HOME,
  GUIDE_PATH,
  GUIDE_TOURS,
  guideBubblePlacement,
  guideRectVisible,
  guideStep,
  guideStepDone,
  guideTourForShell,
  type GuideRect,
} from "../../guide/tour"
import { fieldTheme, themed, useFieldColorScheme } from "../../theme/fieldTheme"

/** The tour opens once the first screen has settled, not over a loading one. */
const AUTO_START_MS = 1200
/** How long a step looks for its control before it says so and offers «Növbəti». */
const FIND_MS = 1500
const DIM = "rgba(6, 22, 17, 0.76)"
/** The finger is 44 dp and bobs 7 dp: the bubble keeps clear of it. */
const FINGER_GAP = 64

/**
 * The first-run guide over the whole app (owner-approved mockup, 2026-10-18):
 * the screen dimmed, the real control lit, a bubble saying what it is for.
 * It lies over the tabs and every stack screen; the app's notices stay above it.
 *
 * Opens by itself once per person after a sign-in (store/guide), and from
 * «Bələdçi» in «Daha çox» and in the profile.
 */
export default function GuideOverlay() {
  const agent = useAuthStore((state) => state.agent)
  const bootstrap = useBootstrapStore((state) => state.data)
  const routeFieldAccess = useBootstrapStore((state) => state.routeFieldAccess)
  const scope = offlineScopeKey(agent?.organizationId, agent?.id)
  const office = hasOfficeAttendanceAccess(bootstrap, agent)
  const tour = guideTourForShell(mainShell({ agent, data: bootstrap, routeFieldAccess, office }).kind)
  const run = useGuideStore((state) => state.run)
  const route = useGuideStore((state) => state.route)
  const due = useGuideStore((state) => guideDue(state, scope, tour))

  useEffect(() => {
    if (scope) useGuideStore.getState().load(scope).catch(() => {})
  }, [scope])

  // The navigator reports every change of screen; this covers the sign-in
  // itself, when the tabs replace the login screen under a new navigator.
  useEffect(() => {
    const follow = () => {
      const name = currentRouteName()
      if (name) useGuideStore.getState().setRoute(name)
    }
    const timers = [0, 600, 2000].map((delay) => setTimeout(follow, delay))
    return () => timers.forEach(clearTimeout)
  }, [scope])

  // A tour belongs to the person who started it.
  useEffect(() => {
    if (run && run.scope !== scope) useGuideStore.getState().stop()
  }, [run, scope])

  useEffect(() => {
    if (!due || !tour || !scope || route !== GUIDE_HOME[tour]) return
    const timer = setTimeout(() => {
      const state = useGuideStore.getState()
      if (guideDue(state, scope, tour) && state.route === GUIDE_HOME[tour]) state.start(scope, tour, { welcome: true })
    }, AUTO_START_MS)
    return () => clearTimeout(timer)
  }, [due, route, scope, tour])

  if (!run || run.scope !== scope) return null
  return <GuideLayer run={run} route={route} name={agent?.name ?? ""} />
}

type Box = { x: number; y: number; width: number; height: number }

function GuideLayer({ run, route, name }: { run: GuideRun; route: string | null; name: string }) {
  const { t } = useTranslation()
  // Drawn again when the phone switches day and night.
  useFieldColorScheme()
  const insets = useSafeAreaInsets()
  const rootRef = useRef<View>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [searched, setSearched] = useState(false)
  const steps = GUIDE_TOURS[run.tour]
  const step = guideStep(run.tour, run.step)
  // Measured per step: a new bubble stays invisible until it knows its height.
  const stepKey = `${run.tour}:${run.step}`
  const [bubble, setBubble] = useState<{ key: string; height: number } | null>(null)
  const bubbleHeight = bubble?.key === stepKey ? bubble.height : null
  const spot = useGuideStore((state) => (step ? state.spots[step.spot] : undefined))

  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => setBox({ x, y, width, height }))
  }, [])

  // The system back button would take the screen from under the tour.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true)
    return () => subscription.remove()
  }, [])

  // Every step starts on its own screen and gives its control a moment to be found.
  useEffect(() => {
    setSearched(false)
    if (!step) return
    const now = useGuideStore.getState().route
    if (now !== step.screen && !guideStepDone(step, now)) openGuideScreen(step.screen)
    const timer = setTimeout(() => setSearched(true), FIND_MS)
    return () => clearTimeout(timer)
  }, [step])

  // «Нажми сюда» counts only the real press: the screen it opens.
  useEffect(() => {
    if (step && guideStepDone(step, route)) useGuideStore.getState().next()
  }, [route, step])

  const frame = box ? { width: box.width, height: box.height, top: insets.top, bottom: insets.bottom } : null
  const onScreen = !!step && route === step.screen
  const measured: GuideRect | null = onScreen && spot && box
    ? { x: spot.x - box.x, y: spot.y - box.y, width: spot.width, height: spot.height }
    : null
  const hole = frame && guideRectVisible(measured, frame) ? padded(measured, frame, step?.kind === "tap" ? 4 : 6) : null
  const tapping = step?.kind === "tap" && !!hole

  const skip = () => useGuideStore.getState().end("skipped")
  const next = () => {
    if (step?.kind === "tap" && step.goal) openGuideScreen(step.goal)
    else useGuideStore.getState().next()
  }

  return (
    <View ref={rootRef} collapsable={false} onLayout={measureRoot} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {hole && frame ? (
        <Spotlight hole={hole} frame={frame} look={step?.kind === "look"} />
      ) : (
        <View testID="guide-dim" onStartShouldSetResponder={() => true} style={[StyleSheet.absoluteFill, styles.dim]} />
      )}
      {hole && tapping ? <TapCue hole={hole} frame={frame!} /> : null}
      {run.step < 0 ? (
        <Welcome run={run} name={name} onStart={() => useGuideStore.getState().next()} onSkip={skip} />
      ) : step && frame && (hole || searched) ? (
        <Bubble
          key={stepKey}
          title={t(`guide.${run.tour}.${step.id}.title`)}
          body={t(`guide.${run.tour}.${step.id}.body`)}
          lines={Array.from({ length: step.lines ?? 0 }, (_, index) => t(`guide.${run.tour}.${step.id}.line${index + 1}`))}
          missing={!hole}
          tapLabel={tapping ? t(`guide.${run.tour}.${step.id}.tap`) : null}
          stepLabel={t("guide.stepOf", { step: run.step + 1, total: steps.length })}
          index={run.step}
          total={steps.length}
          last={run.step === steps.length - 1}
          placement={guideBubblePlacement(hole, frame, bubbleHeight ?? undefined, tapping && hole && fingerAbove(hole, frame) ? FINGER_GAP : undefined)}
          measured={bubbleHeight !== null}
          onMeasure={(height) => setBubble((known) => (known?.key === stepKey && known.height === height ? known : { key: stepKey, height }))}
          onSkip={skip}
          onNext={next}
          onFinish={() => useGuideStore.getState().end("finished")}
          t={t}
        />
      ) : null}
    </View>
  )
}

/** Over a control in the lower half (a tab) the finger stands above it, between it and the bubble. */
function fingerAbove(hole: GuideRect, frame: { height: number }): boolean {
  return hole.y + hole.height / 2 > frame.height / 2
}

/** The lit control, a little larger than itself and kept inside the screen. */
function padded(rect: GuideRect, frame: { width: number; height: number }, pad: number): GuideRect {
  const x = Math.max(0, rect.x - pad)
  const y = Math.max(0, rect.y - pad)
  const right = Math.min(frame.width, rect.x + rect.width + pad)
  const bottom = Math.min(frame.height, rect.y + rect.height + pad)
  return { x, y, width: right - x, height: bottom - y }
}

function holeRadius(hole: GuideRect): number {
  return Math.min(18, hole.width / 2, hole.height / 2)
}

/**
 * The dim with a rounded hole: one border as wide as the screen around the
 * control. Touches outside the hole stop at four blockers; a `look` step
 * covers the hole too, so the tour never presses «Günə başla» for anyone.
 */
function Spotlight({ hole, frame, look }: { hole: GuideRect; frame: { width: number; height: number }; look: boolean }) {
  const spread = Math.ceil(Math.hypot(frame.width, frame.height))
  const radius = holeRadius(hole)
  const block = () => true
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: hole.x - spread,
          top: hole.y - spread,
          width: hole.width + spread * 2,
          height: hole.height + spread * 2,
          borderWidth: spread,
          borderRadius: spread + radius,
          borderColor: DIM,
        }}
      />
      <View
        pointerEvents="none"
        style={[styles.ring, { left: hole.x - 4, top: hole.y - 4, width: hole.width + 8, height: hole.height + 8, borderRadius: radius + 4 }]}
      />
      <View testID="guide-block" onStartShouldSetResponder={block} style={[styles.block, { left: 0, right: 0, top: 0, height: hole.y }]} />
      <View testID="guide-block" onStartShouldSetResponder={block} style={[styles.block, { left: 0, right: 0, top: hole.y + hole.height, bottom: 0 }]} />
      <View testID="guide-block" onStartShouldSetResponder={block} style={[styles.block, { left: 0, width: hole.x, top: hole.y, height: hole.height }]} />
      <View testID="guide-block" onStartShouldSetResponder={block} style={[styles.block, { left: hole.x + hole.width, right: 0, top: hole.y, height: hole.height }]} />
      {look ? <View testID="guide-block" onStartShouldSetResponder={block} style={[styles.block, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]} /> : null}
    </>
  )
}

/** «Bas!»: a ring that keeps leaving the control and a finger beside it. */
function TapCue({ hole, frame }: { hole: GuideRect; frame: { width: number; height: number } }) {
  const pulse = useRef(new Animated.Value(0)).current
  const bob = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const ring = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }))
    const finger = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]))
    ring.start()
    finger.start()
    return () => {
      ring.stop()
      finger.stop()
    }
  }, [bob, pulse])

  const radius = holeRadius(hole)
  const lower = fingerAbove(hole, frame)
  const centerX = hole.x + hole.width / 2
  // Over a tab; beside a control at the top, on the side with room.
  const finger = lower
    ? { left: Math.min(Math.max(8, centerX - 4), frame.width - 52), top: hole.y - 54 }
    : hole.x > 64
      ? { left: hole.x - 56, top: hole.y + hole.height / 2 - 22 }
      : { left: Math.min(hole.x + hole.width + 12, frame.width - 52), top: hole.y + hole.height / 2 - 22 }
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulse,
          {
            left: hole.x - 4,
            top: hole.y - 4,
            width: hole.width + 8,
            height: hole.height + 8,
            borderRadius: radius + 4,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.finger,
          finger,
          lower
            ? { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }) }] }
            : { transform: [{ translateX: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) }] },
        ]}
      >
        <TapIcon name="gesture-tap" size={26} color={fieldTheme.color.primaryStrong} />
      </Animated.View>
    </>
  )
}

function Welcome({ run, name, onStart, onSkip }: { run: GuideRun; name: string; onStart: () => void; onSkip: () => void }) {
  const { t } = useTranslation()
  const firstName = name.trim().split(/\s+/)[0] ?? ""
  const path = GUIDE_PATH[run.tour]
  return (
    <View pointerEvents="box-none" style={styles.welcomeLayer}>
      <View style={styles.welcome} accessibilityViewIsModal>
        <View style={styles.welcomeIcon}>
          <Icon name="compass" size={34} color={fieldTheme.color.primaryStrong} />
        </View>
        <Text style={styles.welcomeTitle}>
          {firstName ? t("guide.welcomeTitle", { name: firstName }) : t("guide.welcomeTitleNoName")}
        </Text>
        <Text style={styles.welcomeBody}>{t("guide.welcomeBody")}</Text>
        <View style={styles.path}>
          {path.map((key, index) => (
            <View key={key} style={styles.pathItem}>
              <View style={styles.pathChip}><Text style={styles.pathChipText}>{t(key)}</Text></View>
              {index < path.length - 1 ? <Text style={styles.pathArrow}>›</Text> : null}
            </View>
          ))}
        </View>
        <Text style={styles.welcomeLength}>{t("guide.welcomeLength", { count: GUIDE_TOURS[run.tour].length })}</Text>
        <View style={styles.buttons}>
          <Pressable accessibilityRole="button" testID="guide-skip" onPress={onSkip} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <Text style={styles.skipText}>{t("guide.skip")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" testID="guide-start" onPress={onStart} style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
            <Text style={styles.nextText}>{t("guide.start")}</Text>
            <Icon name="arrow-forward" size={19} color={fieldTheme.color.onColor} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function Bubble({
  title, body, lines, missing, tapLabel, stepLabel, index, total, last, placement, measured, onMeasure, onSkip, onNext, onFinish, t,
}: {
  title: string
  body: string
  lines: string[]
  missing: boolean
  tapLabel: string | null
  stepLabel: string
  index: number
  total: number
  last: boolean
  placement: ReturnType<typeof guideBubblePlacement>
  measured: boolean
  onMeasure: (height: number) => void
  onSkip: () => void
  onNext: () => void
  onFinish: () => void
  t: (key: string) => string
}) {
  const appear = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!measured) return
    Animated.timing(appear, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()
  }, [appear, measured])

  const position = {
    left: placement.left,
    width: placement.width,
    ...(placement.top !== undefined ? { top: placement.top } : {}),
    ...(placement.bottom !== undefined ? { bottom: placement.bottom } : {}),
  }
  const shift = placement.side === "above" ? 8 : -8
  return (
    <Animated.View
      testID="guide-bubble"
      accessibilityLiveRegion="polite"
      onLayout={(event) => onMeasure(Math.ceil(event.nativeEvent.layout.height))}
      style={[
        styles.bubble,
        position,
        { opacity: measured ? appear : 0, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }] },
      ]}
    >
      {placement.side === "below" ? <View style={[styles.arrow, styles.arrowTop, { left: placement.arrowX - 8 }]} /> : null}
      {placement.side === "above" ? <View style={[styles.arrow, styles.arrowBottom, { left: placement.arrowX - 8 }]} /> : null}
      <View style={styles.bubbleTop}>
        <View style={styles.stepPill}><Text style={styles.stepPillText}>{stepLabel}</Text></View>
        <View style={styles.dots}>
          {Array.from({ length: total }, (_, dot) => (
            <View key={dot} style={[styles.dot, dot < index && styles.dotDone, dot === index && styles.dotCurrent]} />
          ))}
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {lines.length > 0 ? (
        <View style={styles.lines}>
          {lines.map((line, number) => (
            <View key={line} style={styles.line}>
              <View style={styles.lineNumber}><Text style={styles.lineNumberText}>{number + 1}</Text></View>
              <Text style={styles.lineText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {missing ? <Text style={styles.missing}>{t("guide.missing")}</Text> : null}
      <View style={styles.buttons}>
        {last ? null : (
          <Pressable accessibilityRole="button" testID="guide-skip" onPress={onSkip} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <Text style={styles.skipText}>{t("guide.skip")}</Text>
          </Pressable>
        )}
        {tapLabel ? (
          <View style={styles.tapNote} testID="guide-tap-note">
            <Icon name={placement.side === "above" ? "arrow-down" : "arrow-up"} size={17} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.tapNoteText} numberOfLines={2}>{tapLabel}</Text>
          </View>
        ) : last ? (
          <Pressable accessibilityRole="button" testID="guide-finish" onPress={onFinish} style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
            <Text style={styles.nextText}>{t("guide.finish")}</Text>
            <Icon name="checkmark" size={19} color={fieldTheme.color.onColor} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" testID="guide-next" onPress={onNext} style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
            <Text style={styles.nextText}>{t("guide.next")}</Text>
            <Icon name="arrow-forward" size={19} color={fieldTheme.color.onColor} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  )
}

// Built for the day and the night palette; the dim and the white ring read on both.
const styles = themed(() => StyleSheet.create({
  dim: { backgroundColor: DIM },
  block: { position: "absolute" },
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderColor: fieldTheme.color.onColor,
  },
  pulse: {
    position: "absolute",
    borderWidth: 3,
    borderColor: fieldTheme.color.onColor,
  },
  finger: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surface,
    elevation: 6,
  },
  welcomeLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: fieldTheme.space.lg,
  },
  welcome: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 26,
    backgroundColor: fieldTheme.color.surface,
    paddingHorizontal: fieldTheme.space.xl,
    paddingTop: fieldTheme.space.xl,
    paddingBottom: fieldTheme.space.lg,
    elevation: 12,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primarySoft,
    marginBottom: fieldTheme.space.md,
  },
  welcomeTitle: { color: fieldTheme.color.ink, fontSize: 24, lineHeight: 29, fontWeight: "900" },
  welcomeBody: { color: fieldTheme.color.ink, fontSize: 15.5, lineHeight: 22, marginTop: fieldTheme.space.sm },
  path: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: fieldTheme.space.md },
  pathItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  pathChip: {
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pathChipText: { color: fieldTheme.color.primaryStrong, fontSize: 12.5, fontWeight: "800" },
  pathArrow: { color: fieldTheme.color.inkMuted, fontSize: 15, fontWeight: "900" },
  welcomeLength: { color: fieldTheme.color.inkMuted, fontSize: 12.5, fontWeight: "800", marginTop: fieldTheme.space.md },
  bubble: {
    position: "absolute",
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    paddingHorizontal: fieldTheme.space.lg,
    paddingTop: fieldTheme.space.lg,
    paddingBottom: 14,
    elevation: 12,
  },
  arrow: {
    position: "absolute",
    width: 16,
    height: 16,
    backgroundColor: fieldTheme.color.surface,
    transform: [{ rotate: "45deg" }],
  },
  arrowTop: { top: -8 },
  arrowBottom: { bottom: -8 },
  bubbleTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  stepPill: {
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepPillText: { color: fieldTheme.color.primaryStrong, fontSize: 12.5, fontWeight: "900" },
  dots: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1, flexWrap: "wrap" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.surfaceStrong },
  dotDone: { backgroundColor: fieldTheme.color.primary },
  dotCurrent: { width: 20, backgroundColor: fieldTheme.color.primaryStrong },
  title: { color: fieldTheme.color.ink, fontSize: 19, lineHeight: 24, fontWeight: "900" },
  body: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, marginTop: 6 },
  lines: { gap: 7, marginTop: 10 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.canvas,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  lineNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primaryStrong,
  },
  lineNumberText: { color: fieldTheme.color.onColor, fontSize: 12.5, fontWeight: "900" },
  lineText: { flex: 1, color: fieldTheme.color.ink, fontSize: 14.5, lineHeight: 19, fontWeight: "800" },
  missing: { color: fieldTheme.color.amber, fontSize: 13.5, lineHeight: 19, fontWeight: "700", marginTop: 8 },
  buttons: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  skip: {
    minHeight: 46,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: { color: fieldTheme.color.inkMuted, fontSize: 15, fontWeight: "800" },
  next: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: fieldTheme.color.primaryStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.md,
  },
  nextText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  tapNote: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: fieldTheme.color.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: fieldTheme.space.md,
  },
  tapNoteText: { flexShrink: 1, color: fieldTheme.color.primaryStrong, fontSize: 14.5, fontWeight: "900", textAlign: "center" },
  pressed: { opacity: 0.8 },
}))
