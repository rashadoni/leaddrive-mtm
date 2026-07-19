import React, { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { useTranslation } from "react-i18next"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import OrganizationsList from "./OrganizationsList"
import ContactsList from "./ContactsList"

type BaseTab = "organizations" | "contacts"

/**
 * "База" hub — the Agent master-data section. A segmented control switches
 * between the assigned organizations (SWM-01/07) and contacts (SWM-05); each
 * list owns its own search / fetch / offline handling.
 */
export default function BaseScreen() {
  const { t } = useTranslation()
  const headerTop = useHeaderTop()
  const [tab, setTab] = useState<BaseTab>("organizations")

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>{t("navV2.base")}</Text>
        <View style={styles.segment}>
          {(["organizations", "contacts"] as const).map((key) => {
            const active = tab === key
            return (
              <TouchableOpacity
                key={key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setTab(key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t(key === "organizations" ? "organizations.title" : "contacts.title")}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {tab === "organizations" ? <OrganizationsList /> : <ContactsList />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  segment: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 4,
    marginTop: 14,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: "#fff" },
  segmentText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  segmentTextActive: { color: "#6C63FF" },
})
