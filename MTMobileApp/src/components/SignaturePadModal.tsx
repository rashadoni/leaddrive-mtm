import React, { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme } from "../theme/fieldTheme"
import {
  SIGNATURE_MIN_INK_PX,
  signatureCaptureFromStrokes,
  signatureInkLength,
  type SignatureCapture,
  type SignatureStroke,
} from "../services/visit-signature-path"

/**
 * The customer signs with a finger on the agent's tablet or phone. The pad is
 * a canvas in a WebView — the app already ships the WebView and no drawing
 * library — and it sends each finished stroke back as points; the path the
 * server stores is built on this side by the tested
 * `signatureCaptureFromStrokes`. The pad fills the modal: no scroll around it,
 * so a stroke is never taken for a scroll gesture.
 */
const PAD_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#ffffff;touch-action:none;-webkit-user-select:none;user-select:none}
canvas{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none}
.line{position:absolute;left:28px;right:28px;bottom:26%;border-bottom:2px dashed #C9D8D0;pointer-events:none}
.x{position:absolute;left:28px;bottom:calc(26% + 8px);font:600 24px sans-serif;color:#9DB2A8;pointer-events:none}
</style></head><body><div class="x">&#x2715;</div><div class="line"></div><canvas id="pad"></canvas>
<script>(function(){
var c=document.getElementById('pad'),ctx=c.getContext('2d'),strokes=[],cur=null,dpr=window.devicePixelRatio||1;
function post(m){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(m))}
function pen(){ctx.lineWidth=2.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#13231F'}
function draw(s){if(!s.length)return;pen();ctx.beginPath();ctx.moveTo(s[0][0],s[0][1]);if(s.length===1)ctx.lineTo(s[0][0]+0.6,s[0][1]);for(var i=1;i<s.length;i++)ctx.lineTo(s[i][0],s[i][1]);ctx.stroke()}
function redraw(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.setTransform(dpr,0,0,dpr,0,0);for(var i=0;i<strokes.length;i++)draw(strokes[i]);if(cur)draw(cur)}
function size(){c.width=Math.round(c.clientWidth*dpr);c.height=Math.round(c.clientHeight*dpr);redraw()}
function at(e){var r=c.getBoundingClientRect();return[Math.round((e.clientX-r.left)*10)/10,Math.round((e.clientY-r.top)*10)/10]}
c.addEventListener('pointerdown',function(e){if(!e.isPrimary)return;e.preventDefault();if(c.setPointerCapture)c.setPointerCapture(e.pointerId);cur=[at(e)];draw(cur)});
c.addEventListener('pointermove',function(e){if(!cur||!e.isPrimary)return;e.preventDefault();var list=e.getCoalescedEvents?e.getCoalescedEvents():[e];if(!list.length)list=[e];for(var i=0;i<list.length;i++){var p=at(list[i]),l=cur[cur.length-1];pen();ctx.beginPath();ctx.moveTo(l[0],l[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();cur.push(p)}});
function end(e){if(!cur||(e&&e.isPrimary===false))return;strokes.push(cur);post({type:'stroke',points:cur,width:c.clientWidth,height:c.clientHeight});cur=null}
c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
window.clearPad=function(){strokes=[];cur=null;redraw()};
window.addEventListener('resize',size);size();
})();</script></body></html>`

interface Props {
  visible: boolean
  customerName?: string
  onCancel: () => void
  onSave: (capture: SignatureCapture, signerName?: string) => Promise<void>
}

export default function SignaturePadModal({ visible, customerName, onCancel, onSave }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const webViewRef = useRef<WebView>(null)
  const strokes = useRef<SignatureStroke[]>([])
  const padSize = useRef({ width: 0, height: 0 })
  const [ink, setInk] = useState(0)
  const [signerName, setSignerName] = useState("")
  const [saving, setSaving] = useState(false)
  const [padKey, setPadKey] = useState(0)

  useEffect(() => {
    if (!visible) return
    strokes.current = []
    padSize.current = { width: 0, height: 0 }
    setInk(0)
    setSignerName("")
    setSaving(false)
    setPadKey((key) => key + 1)
  }, [visible])

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: any
    try {
      message = JSON.parse(event.nativeEvent.data)
    } catch {
      return
    }
    if (message?.type !== "stroke" || !Array.isArray(message.points)) return
    strokes.current = [...strokes.current, message.points]
    padSize.current = { width: Number(message.width) || 0, height: Number(message.height) || 0 }
    setInk(signatureInkLength(strokes.current))
  }

  const clear = () => {
    strokes.current = []
    setInk(0)
    webViewRef.current?.injectJavaScript("window.clearPad && window.clearPad(); true;")
  }

  const capture = ink >= SIGNATURE_MIN_INK_PX
    ? signatureCaptureFromStrokes(strokes.current, padSize.current.width, padSize.current.height)
    : null
  const canSave = Boolean(capture) && !saving

  const save = async () => {
    if (!capture || saving) return
    setSaving(true)
    try {
      await onSave(capture, signerName.trim() || undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View
        testID="signature-pad"
        style={[styles.screen, { paddingTop: insets.top + fieldTheme.space.md, paddingBottom: insets.bottom + fieldTheme.space.md }]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{t("signature.title")}</Text>
            {customerName ? <Text style={styles.subtitle} numberOfLines={1}>{customerName}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("signature.cancel")}
            onPress={onCancel}
            hitSlop={12}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Icon name="close" size={26} color={fieldTheme.color.ink} />
          </Pressable>
        </View>

        <Text style={styles.hint}>{t("signature.hint")}</Text>

        <TextInput
          value={signerName}
          onChangeText={setSignerName}
          placeholder={t("signature.signerNamePlaceholder")}
          placeholderTextColor={fieldTheme.color.inkMuted}
          accessibilityLabel={t("signature.signerNamePlaceholder")}
          maxLength={120}
          autoCapitalize="words"
          returnKeyType="done"
          style={styles.nameInput}
        />

        <View style={styles.padCard}>
          <WebView
            key={padKey}
            ref={webViewRef}
            testID="signature-pad-canvas"
            source={{ html: PAD_HTML, baseUrl: "about:blank" }}
            originWhitelist={["about:blank"]}
            onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled={false}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            setSupportMultipleWindows={false}
            scrollEnabled={false}
            overScrollMode="never"
            bounces={false}
            style={styles.pad}
            accessibilityLabel={t("signature.padLabel")}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: ink === 0 || saving }}
            disabled={ink === 0 || saving}
            onPress={clear}
            style={({ pressed }) => [styles.secondaryButton, (ink === 0 || saving) && styles.disabled, pressed && styles.pressed]}
          >
            <Icon name="refresh-outline" size={21} color={fieldTheme.color.primary} />
            <Text style={styles.secondaryText}>{t("signature.clear")}</Text>
          </Pressable>
          <Pressable
            testID="signature-pad-save"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={save}
            style={({ pressed }) => [styles.primaryButton, !canSave && styles.disabled, pressed && styles.pressed]}
          >
            {saving
              ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
              : <Icon name="checkmark-circle" size={22} color={fieldTheme.color.onColor} />}
            <Text style={styles.primaryText}>{t("signature.save")}</Text>
          </Pressable>
        </View>
        {ink > 0 && ink < SIGNATURE_MIN_INK_PX ? <Text style={styles.tooShort}>{t("signature.tooShort")}</Text> : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: fieldTheme.color.canvas,
    paddingHorizontal: fieldTheme.space.lg,
    gap: fieldTheme.space.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 22, fontWeight: "800", color: fieldTheme.color.ink },
  subtitle: { fontSize: 15, fontWeight: "600", color: fieldTheme.color.inkMuted },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: fieldTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  hint: { fontSize: 15, lineHeight: 21, color: fieldTheme.color.ink },
  nameInput: {
    minHeight: 52,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
    paddingHorizontal: fieldTheme.space.lg,
    fontSize: 16,
    color: fieldTheme.color.ink,
  },
  padCard: {
    flex: 1,
    minHeight: 220,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1.5,
    borderColor: fieldTheme.color.border,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  pad: { flex: 1, backgroundColor: "#FFFFFF" },
  actions: { flexDirection: "row", gap: fieldTheme.space.md },
  secondaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1.5,
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
  },
  secondaryText: { fontSize: 16, fontWeight: "700", color: fieldTheme.color.primary },
  primaryButton: {
    flex: 2,
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
  },
  primaryText: { fontSize: 17, fontWeight: "800", color: fieldTheme.color.onColor },
  tooShort: { fontSize: 14, color: fieldTheme.color.amber, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
})
