import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { ask } from "../../services/app-feedback"
import { readLocationFix } from "../../services/location-fix"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { useBootstrapStore } from "../../store/bootstrap"
import { useLocationFixStore } from "../../store/location-fixes"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { CARTO_TILE_WEBVIEW_ORIGINS } from "../maps/carto-tiles"
import { buildLocationFixMapDocument } from "./organization-location-fix-map"
import {
  formatLocationFixDistance,
  locationFixDistanceMeters,
  locationFixFailure,
  locationFixPayload,
  locationFixProblem,
  usablePoint,
  type LocationFixFailure,
  type LocationFixPoint,
  type LocationFixProblem,
  type LocationFixReading,
} from "./organization-location-fix-model"

type Language = "ru" | "az" | "en"

const COPY = {
  ru: {
    back: "Назад",
    title: "Где клиент на самом деле?",
    locating: "Определяем, где вы сейчас…",
    locateFailed: "Не удалось определить, где вы. Включите геолокацию, выйдите туда, где ловит GPS, и повторите.",
    retry: "Повторить",
    hint: "Двигайте карту — булавка покажет, где вход",
    here: "Клиент здесь",
    current: "Сейчас в базе",
    mapLoading: "Загружаем карту…",
    mapUnavailable: "Карта не загрузилась, но место отправить можно: булавка стоит там, где вы.",
    mapAttribution: "© OpenStreetMap © CARTO",
    zoomIn: "Ближе",
    zoomOut: "Дальше",
    newPlace: "Новое место",
    fromYou: (distance: string) => `в ${distance} от вас`,
    atYou: "там, где вы стоите",
    moves: (distance: string) => `Точка клиента переедет на ${distance}`,
    firstPin: "У клиента появится точка на карте",
    accuracy: (meters: number) => `GPS ±${meters} м`,
    accuracyUnknown: "GPS: точность неизвестна",
    backToMe: "Вернуть булавку ко мне",
    comment: "Комментарий — по желанию (например: вход со двора)",
    send: "Отправить на исправление",
    sending: "Отправляем…",
    sent: "Запрос отправлен руководителю",
    sentBody: "Как только он подтвердит новое место, вам придёт уведомление, а точка клиента переедет у всех. Визит можно начинать прямо здесь — руководитель увидит его с пометкой «адрес на проверке».",
    units: { m: "м", km: "км" },
    problems: {
      noFix: "Ждём, пока телефон определит, где вы.",
      mock: "В телефоне включена подмена местоположения. Выключите её — иначе запрос не примут.",
      accuracy: "GPS пока неточный. Выйдите на открытое место и подождите несколько секунд.",
      stale: "Координата устарела. Нажмите «Обновить моё место».",
      pinTooFar: "Булавка слишком далеко от вас. Подойдите к клиенту или верните булавку к себе.",
      unchanged: "Точка клиента уже стоит здесь — исправлять нечего.",
    } satisfies Record<LocationFixProblem, string>,
    failures: {
      pending: "По этому клиенту запрос уже ждёт решения руководителя.",
      switchedOff: "Организация отключила такие запросы.",
      notFound: "Этот клиент вам сейчас недоступен.",
      tooMany: "Слишком много запросов подряд. Попробуйте позже.",
      offline: "Нет связи с сервером. Проверьте интернет и отправьте ещё раз.",
      failed: "Не получилось отправить. Попробуйте ещё раз.",
    },
    refresh: "Обновить моё место",
  },
  az: {
    back: "Geri",
    title: "Müştəri əslində haradadır?",
    locating: "Harada olduğunuz müəyyən edilir…",
    locateFailed: "Yerinizi müəyyən etmək alınmadı. Geolokasiyanı yandırın, GPS tutan yerə çıxın və təkrar edin.",
    retry: "Təkrar et",
    hint: "Xəritəni hərəkət etdirin — sancaq girişi göstərsin",
    here: "Müştəri buradadır",
    current: "Bazada indi",
    mapLoading: "Xəritə yüklənir…",
    mapUnavailable: "Xəritə yüklənmədi, amma yeri göndərmək olar: sancaq olduğunuz yerdədir.",
    mapAttribution: "© OpenStreetMap © CARTO",
    zoomIn: "Yaxınlaşdır",
    zoomOut: "Uzaqlaşdır",
    newPlace: "Yeni yer",
    fromYou: (distance: string) => `sizdən ${distance} aralı`,
    atYou: "dayandığınız yerdə",
    moves: (distance: string) => `Müştərinin nöqtəsi ${distance} yerini dəyişəcək`,
    firstPin: "Müştərinin xəritədə nöqtəsi olacaq",
    accuracy: (meters: number) => `GPS ±${meters} m`,
    accuracyUnknown: "GPS: dəqiqlik məlum deyil",
    backToMe: "Sancağı yanıma qaytar",
    comment: "Şərh — istəyə görə (məsələn: giriş həyətdəndir)",
    send: "Düzəliş üçün göndər",
    sending: "Göndərilir…",
    sent: "Sorğu rəhbərə göndərildi",
    sentBody: "Rəhbər yeni yeri təsdiqləyən kimi sizə bildiriş gələcək və müştərinin nöqtəsi hamıda dəyişəcək. Vizitə elə buradan başlaya bilərsiniz — rəhbər onu «ünvan yoxlanılır» qeydi ilə görəcək.",
    units: { m: "m", km: "km" },
    problems: {
      noFix: "Telefonun yerinizi müəyyən etməsini gözləyirik.",
      mock: "Telefonda saxta yer rejimi yanılıdır. Söndürün — əks halda sorğu qəbul olunmayacaq.",
      accuracy: "GPS hələ dəqiq deyil. Açıq yerə çıxın və bir neçə saniyə gözləyin.",
      stale: "Koordinat köhnəlib. «Yerimi yenilə» düyməsini basın.",
      pinTooFar: "Sancaq sizdən çox uzaqdadır. Müştəriyə yaxınlaşın və ya sancağı yanınıza qaytarın.",
      unchanged: "Müştərinin nöqtəsi artıq buradadır — düzəldiləsi bir şey yoxdur.",
    } satisfies Record<LocationFixProblem, string>,
    failures: {
      pending: "Bu müştəri üzrə sorğu artıq rəhbərin qərarını gözləyir.",
      switchedOff: "Təşkilat belə sorğuları söndürüb.",
      notFound: "Bu müştəri hazırda sizə əlçatan deyil.",
      tooMany: "Ardıcıl çox sorğu göndərilib. Sonra yenidən cəhd edin.",
      offline: "Serverlə əlaqə yoxdur. İnterneti yoxlayın və yenidən göndərin.",
      failed: "Göndərmək alınmadı. Yenidən cəhd edin.",
    },
    refresh: "Yerimi yenilə",
  },
  en: {
    back: "Back",
    title: "Where is the customer really?",
    locating: "Finding where you are…",
    locateFailed: "Could not find where you are. Turn location on, step out to where GPS works, and try again.",
    retry: "Try again",
    hint: "Move the map — the pin shows where the entrance is",
    here: "Customer is here",
    current: "On file now",
    mapLoading: "Loading the map…",
    mapUnavailable: "The map did not load, but the place can still be sent: the pin stands where you are.",
    mapAttribution: "© OpenStreetMap © CARTO",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    newPlace: "New place",
    fromYou: (distance: string) => `${distance} from you`,
    atYou: "where you are standing",
    moves: (distance: string) => `The customer's pin will move by ${distance}`,
    firstPin: "The customer will get a pin on the map",
    accuracy: (meters: number) => `GPS ±${meters} m`,
    accuracyUnknown: "GPS: accuracy unknown",
    backToMe: "Bring the pin back to me",
    comment: "Comment — optional (for example: entrance from the yard)",
    send: "Send for correction",
    sending: "Sending…",
    sent: "The request went to your manager",
    sentBody: "As soon as the new place is confirmed you will be notified, and the customer's pin will move for everyone. You can start the visit right here — your manager will see it marked «address under review».",
    units: { m: "m", km: "km" },
    problems: {
      noFix: "Waiting for the phone to find where you are.",
      mock: "Mock location is on in this phone. Turn it off — otherwise the request will not be taken.",
      accuracy: "GPS is not precise yet. Step into the open and wait a few seconds.",
      stale: "The position is out of date. Press «Refresh my place».",
      pinTooFar: "The pin is too far from you. Come closer to the customer or bring the pin back to you.",
      unchanged: "The customer's pin is already here — there is nothing to correct.",
    } satisfies Record<LocationFixProblem, string>,
    failures: {
      pending: "A request about this customer is already waiting for a manager.",
      switchedOff: "The organization has switched these requests off.",
      notFound: "This customer is not available to you now.",
      tooMany: "Too many requests in a row. Try later.",
      offline: "No connection to the server. Check the internet and send again.",
      failed: "Could not send. Try again.",
    },
    refresh: "Refresh my place",
  },
} as const

function languageFor(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

/**
 * «Клиент здесь»: the agent shows where the customer really is and sends that
 * to a manager. As a taxi app shows a pick-up point — the pin stands in the
 * middle and the map moves under it; it starts where the phone is, so an agent
 * at the door has nothing to do but press «Отправить».
 *
 * What cannot be sent is said under the map BEFORE the button is pressed (the
 * server's own rules, repeated in organization-location-fix-model.ts), and the
 * button waits for it: a phone that does not know where it is, a pin moved
 * streets away, a pin that is already there.
 */
export default function RouteOrganizationLocationFixScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "OrganizationLocationFix">>()
  const { i18n } = useTranslation()
  const language = languageFor(i18n.language)
  const copy = COPY[language]
  const headerTop = useHeaderTop()
  const { id, name } = route.params
  const current = useMemo(
    () => usablePoint({ latitude: route.params.latitude, longitude: route.params.longitude }),
    [route.params.latitude, route.params.longitude],
  )
  const tileApiKey = useBootstrapStore((state) => state.data?.maps?.cartoBasemapsApiKey ?? null)
  const idempotencyKey = useRef(`location-fix-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const webView = useRef<WebView>(null)
  const [fix, setFix] = useState<LocationFixReading | null>(null)
  /** Where the map started: the document is built once, for the first fix. */
  const [start, setStart] = useState<LocationFixReading | null>(null)
  const [pin, setPin] = useState<LocationFixPoint | null>(null)
  const [locating, setLocating] = useState(true)
  const [locateFailed, setLocateFailed] = useState(false)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<LocationFixFailure | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const locate = useCallback(async (moveMap: boolean) => {
    setLocating(true)
    setLocateFailed(false)
    try {
      const reading = await readLocationFix()
      setFix(reading)
      setNow(Date.now())
      setStart((first) => first ?? reading)
      setPin((kept) => (moveMap || !kept ? { latitude: reading.latitude, longitude: reading.longitude } : kept))
      const accuracy = typeof reading.accuracy === "number" ? reading.accuracy : 0
      webView.current?.injectJavaScript(
        `window.__setAgent && window.__setAgent(${reading.latitude}, ${reading.longitude}, ${accuracy});`
        + (moveMap ? `window.__setCenter && window.__setCenter(${reading.latitude}, ${reading.longitude});` : "")
        + "true;",
      )
    } catch {
      setLocateFailed(true)
    } finally {
      setLocating(false)
    }
  }, [])

  useEffect(() => { void locate(true) }, [locate])

  // A fix grows old while the agent looks at the map: the screen notices.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const mapDocument = useMemo(() => (start ? buildLocationFixMapDocument(
    { center: start, agent: start, current },
    {
      loading: copy.mapLoading,
      unavailable: copy.mapUnavailable,
      attribution: copy.mapAttribution,
      here: copy.here,
      current: copy.current,
      zoomIn: copy.zoomIn,
      zoomOut: copy.zoomOut,
    },
    { apiKey: tileApiKey },
  ) : null), [copy, current, start, tileApiKey])
  // A CARTO key is bound to the tenant's web origin, so the tile requests
  // must carry that origin as their referrer; without a key stay sandboxed.
  const tileOrigin = tileApiKey ? api.serverOrigin() : null
  const webViewSource = useMemo(
    () => (mapDocument ? { html: mapDocument, baseUrl: tileOrigin ? `${tileOrigin}/` : "about:blank" } : null),
    [mapDocument, tileOrigin],
  )
  const webViewOrigins = useMemo(
    () => (tileOrigin ? [...CARTO_TILE_WEBVIEW_ORIGINS, tileOrigin] : CARTO_TILE_WEBVIEW_ORIGINS),
    [tileOrigin],
  )

  const onMapMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; latitude?: unknown; longitude?: unknown }
      if (message.type !== "center") return
      const moved = usablePoint(message)
      if (moved) {
        setPin(moved)
        setFailure(null)
      }
    } catch {
      // Not a message of ours.
    }
  }

  const problem = locationFixProblem(pin, fix, current, now)
  const fromAgent = pin && fix ? locationFixDistanceMeters(fix, pin) : null
  const moved = pin && current ? locationFixDistanceMeters(current, pin) : null
  const distance = (meters: number) => formatLocationFixDistance(meters, language, copy.units)

  const send = async () => {
    if (!pin || !fix || problem || sending) return
    setSending(true)
    setFailure(null)
    try {
      const response = await api.submitOrganizationLocationRequest(id, locationFixPayload(idempotencyKey.current, pin, fix, comment, Date.now()))
      if (!response?.success) throw new Error("LOCATION_REQUEST_NOT_STORED")
      // He may start the visit from here while a manager decides: the check-in is measured against this place.
      useLocationFixStore.getState().remember(id, pin)
      await ask({
        title: copy.sent,
        message: copy.sentBody,
        tone: "success",
        buttons: [{ text: "OK", value: true }],
        dismissValue: true,
      })
      navigation.goBack()
    } catch (error: any) {
      if (error?.message === "SESSION_EXPIRED") return
      const reason = locationFixFailure(error)
      setFailure(reason)
      // The server measured it otherwise than the app did a moment ago: look again.
      if (reason === "stale" || reason === "accuracy") void locate(false)
    } finally {
      setSending(false)
    }
  }

  const said = failure
    ? (failure in copy.problems ? copy.problems[failure as LocationFixProblem] : copy.failures[failure as keyof typeof copy.failures])
    : problem && problem !== "noFix" ? copy.problems[problem] : null
  const canSend = !problem && !sending && !locating

  return (
    <KeyboardAvoidingView style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.back}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Icon name="arrow-back" size={21} color={fieldTheme.color.onColor} />
          <Text style={styles.backText}>{copy.back}</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={2}>{copy.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{name || ""}</Text>
      </View>

      {!start ? (
        <View style={styles.state} accessibilityLiveRegion="polite">
          {locateFailed ? (
            <>
              <Icon name="locate-outline" size={36} color={fieldTheme.color.amber} />
              <Text style={styles.stateText}>{copy.locateFailed}</Text>
              <Pressable accessibilityRole="button" onPress={() => void locate(true)} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                <Text style={styles.retryText}>{copy.retry}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={fieldTheme.color.primaryStrong} />
              <Text style={styles.stateText}>{copy.locating}</Text>
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.mapFrame}>
            {webViewSource && !mapFailed ? (
              <WebView
                ref={webView}
                testID="location-fix-map"
                source={webViewSource}
                originWhitelist={webViewOrigins}
                javaScriptEnabled
                domStorageEnabled={false}
                cacheEnabled
                allowFileAccess={false}
                allowUniversalAccessFromFileURLs={false}
                mixedContentMode="never"
                setSupportMultipleWindows={false}
                scrollEnabled={false}
                bounces={false}
                onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
                onMessage={onMapMessage}
                onError={() => setMapFailed(true)}
                accessibilityLabel={copy.title}
                style={styles.webView}
              />
            ) : (
              <View style={styles.mapFallback}>
                <Icon name="map-outline" size={30} color={fieldTheme.color.inkMuted} />
                <Text style={styles.stateText}>{copy.mapUnavailable}</Text>
              </View>
            )}
            <View style={styles.hint} pointerEvents="none">
              <Text style={styles.hintText}>{copy.hint}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.backToMe}
              onPress={() => void locate(true)}
              style={({ pressed }) => [styles.backToMe, pressed && styles.pressed]}
            >
              {locating
                ? <ActivityIndicator size="small" color={fieldTheme.color.primary} />
                : <Icon name="locate" size={18} color={fieldTheme.color.primary} />}
              <Text style={styles.backToMeText}>{copy.backToMe}</Text>
            </Pressable>
          </View>

          <View style={styles.sheet}>
            <View style={styles.sheetRow}>
              <View style={styles.sheetCopy}>
                <Text style={styles.label}>{copy.newPlace}</Text>
                <Text style={styles.value} testID="location-fix-place">
                  {fromAgent == null ? "—" : fromAgent < 5 ? copy.atYou : copy.fromYou(distance(fromAgent))}
                </Text>
                <Text style={styles.note} testID="location-fix-moves">
                  {moved == null ? copy.firstPin : copy.moves(distance(moved))}
                </Text>
              </View>
              <View style={[styles.chip, problem === "accuracy" || problem === "mock" ? styles.chipWarn : styles.chipOk]}>
                <Text style={[styles.chipText, problem === "accuracy" || problem === "mock" ? styles.chipTextWarn : styles.chipTextOk]}>
                  {typeof fix?.accuracy === "number" ? copy.accuracy(Math.round(fix.accuracy)) : copy.accuracyUnknown}
                </Text>
              </View>
            </View>

            {said ? (
              <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={18} color={fieldTheme.color.amber} />
                <Text style={styles.problemText} testID="location-fix-problem">{said}</Text>
              </View>
            ) : null}
            {problem === "stale" ? (
              <Pressable accessibilityRole="button" onPress={() => void locate(false)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Icon name="refresh" size={18} color={fieldTheme.color.primaryStrong} />
                <Text style={styles.secondaryText}>{copy.refresh}</Text>
              </Pressable>
            ) : null}

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={copy.comment}
              placeholderTextColor={fieldTheme.color.inkMuted}
              maxLength={300}
              style={styles.input}
              accessibilityLabel={copy.comment}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.send}
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => void send()}
              testID="location-fix-send"
              style={({ pressed }) => [styles.submit, !canSend && styles.disabled, pressed && styles.pressed]}
            >
              {sending
                ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
                : <Icon name="send" size={18} color={fieldTheme.color.onColor} />}
              <Text style={styles.submitText}>{sending ? copy.sending : copy.send}</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.md, backgroundColor: fieldTheme.color.primaryStrong },
  backButton: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingRight: fieldTheme.space.md },
  backText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
  title: { color: fieldTheme.color.onColor, fontSize: 21, lineHeight: 27, fontWeight: "900", marginTop: fieldTheme.space.xs },
  subtitle: { color: fieldTheme.color.primarySoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.xl },
  stateText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: { minHeight: 48, paddingHorizontal: fieldTheme.space.xl, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  mapFrame: { flex: 1, backgroundColor: fieldTheme.color.surfaceStrong },
  webView: { flex: 1, backgroundColor: fieldTheme.color.surfaceStrong },
  mapFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.xl },
  hint: { position: "absolute", left: 12, right: 68, top: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(19,35,31,0.88)" },
  hintText: { color: fieldTheme.color.onColor, fontSize: 13, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  backToMe: { position: "absolute", left: 12, bottom: 12, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, elevation: 3 },
  backToMeText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  sheet: { gap: fieldTheme.space.sm, padding: fieldTheme.space.lg, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  sheetRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  sheetCopy: { flex: 1, minWidth: 0 },
  label: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16 },
  value: { color: fieldTheme.color.ink, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  note: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  chip: { borderRadius: fieldTheme.radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  chipOk: { backgroundColor: fieldTheme.color.primarySoft },
  chipWarn: { backgroundColor: fieldTheme.color.amberSoft },
  chipText: { fontSize: 12, fontWeight: "900" },
  chipTextOk: { color: fieldTheme.color.primary },
  chipTextWarn: { color: fieldTheme.color.amber },
  problem: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 10, backgroundColor: fieldTheme.color.amberSoft },
  problemText: { flex: 1, color: fieldTheme.color.amber, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  secondary: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  secondaryText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: fieldTheme.color.border, paddingHorizontal: 12, color: fieldTheme.color.ink, fontSize: 14, backgroundColor: fieldTheme.color.canvas },
  submit: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 15, backgroundColor: fieldTheme.color.primary },
  submitText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
}))
