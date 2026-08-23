import React from "react"
import { StyleSheet, Text, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme } from "../theme/fieldTheme"

type MobileWorkflowGuideStep = {
  icon: string
  label: string
  active?: boolean
}

type MobileWorkflowGuideProps = {
  title: string
  body: string
  steps: MobileWorkflowGuideStep[]
}

/** A short orientation card shown before a dense list or manager workspace. */
export default function MobileWorkflowGuide({ title, body, steps }: MobileWorkflowGuideProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.steps}>
        {steps.map((step, index) => (
          <View key={`${index}-${step.label}`} style={[styles.step, step.active && styles.stepActive]}>
            <View style={[styles.number, step.active && styles.numberActive]}>
              <Text style={[styles.numberText, step.active && styles.numberTextActive]}>{index + 1}</Text>
            </View>
            <Icon
              name={step.icon}
              size={17}
              color={step.active ? fieldTheme.color.primaryStrong : fieldTheme.color.inkMuted}
            />
            <Text style={[styles.stepLabel, step.active && styles.stepLabelActive]}>{step.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    marginBottom: fieldTheme.space.md,
    borderWidth: 1,
    borderColor: "#CFE4DC",
    borderRadius: fieldTheme.radius.md,
    backgroundColor: "#F3FAF7",
    padding: fieldTheme.space.md,
  },
  title: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  body: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  steps: { flexDirection: "row", gap: fieldTheme.space.xs, marginTop: fieldTheme.space.md },
  step: {
    flex: 1,
    minHeight: 68,
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.surface,
    padding: fieldTheme.space.sm,
  },
  stepActive: { backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: "#9BCBB9" },
  number: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surfaceStrong,
    marginBottom: 5,
  },
  numberActive: { backgroundColor: fieldTheme.color.primaryStrong },
  numberText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "900" },
  numberTextActive: { color: fieldTheme.color.onColor },
  // Do not cap the label at two lines: Russian and Azerbaijani labels can
  // legitimately be longer on 320–360 dp phones. The card grows instead of
  // hiding the last action in a three-step workflow.
  stepLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 4, flexShrink: 1 },
  stepLabelActive: { color: fieldTheme.color.primaryStrong },
})
