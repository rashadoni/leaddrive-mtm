import React, { createContext, useContext } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { currentFieldColorScheme, themed } from '../../theme/fieldTheme';

/** Only the separate Time navigator opts in. Route & Field keeps its own presentation. */
export const TimePresentation = createContext(false);
export const useTimePresentation = () => useContext(TimePresentation);
const LIGHT = {
  canvas: '#F0F4F1',
  surface: '#FCFDFB',
  inset: '#E6EEE8',
  ink: '#162E28',
  muted: '#536D63',
  line: '#CFDDD4',
  accent: '#17674F',
  fill: '#17674F',
  onFill: '#F8FCF9',
  soft: '#E0F0E6',
  blue: '#275EAD',
  blueSoft: '#E7EEFA',
  amber: '#815300',
  amberSoft: '#F8EDCE',
  danger: '#A8313C',
  dangerSoft: '#FBE8E9',
};
const DARK: typeof LIGHT = {
  canvas: '#101A16',
  surface: '#18251F',
  inset: '#22332B',
  ink: '#E8F2EC',
  muted: '#ABBCB2',
  line: '#3D5347',
  accent: '#8DD6AE',
  fill: '#286C51',
  onFill: '#F8FCF9',
  soft: '#234332',
  blue: '#A9C9FF',
  blueSoft: '#25374F',
  amber: '#F0CC7C',
  amberSoft: '#3C321C',
  danger: '#FFB5BA',
  dangerSoft: '#45272B',
};
export const TIME_PALETTES = { light: LIGHT, dark: DARK } as const;
export const timeColor = Object.fromEntries(
  Object.keys(LIGHT).map(key => [key, undefined]),
) as typeof LIGHT;
for (const key of Object.keys(LIGHT) as (keyof typeof LIGHT)[]) {
  Object.defineProperty(timeColor, key, {
    enumerable: true,
    get: () => TIME_PALETTES[currentFieldColorScheme()][key],
  });
}

export function TimeHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={timeStyles.header}>
      <View style={timeStyles.headerCopy}>
        <Text style={timeStyles.eyebrow}>LeadDrive Time</Text>
        <Text accessibilityRole="header" style={timeStyles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={timeStyles.caption}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}
export function TimeAction({
  label,
  icon,
  onPress,
  testID,
  disabled = false,
  primary = false,
  iconOnly = false,
  style,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  primary?: boolean;
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        timeStyles.action,
        primary && timeStyles.primary,
        pressed && timeStyles.pressed,
        disabled && timeStyles.disabled,
        style,
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={20}
          color={primary ? timeColor.onFill : timeColor.accent}
        />
      ) : null}
      {!iconOnly && (
        <Text
          style={[timeStyles.actionText, primary && timeStyles.primaryText]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function TimeFilters<T extends string>({
  value,
  onChange,
  options,
  testID,
  disabled = false,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; count?: number }[];
  testID: string;
  disabled?: boolean;
}) {
  return (
    <View style={timeStyles.filters} accessibilityRole="tablist">
      {options.map(option => (
        <Pressable
          key={option.value}
          testID={`${testID}-${option.value}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => [
            timeStyles.filter,
            value === option.value && timeStyles.filterSelected,
            pressed && timeStyles.pressed,
          ]}
        >
          <Text
            style={[
              timeStyles.filterText,
              value === option.value && timeStyles.filterSelectedText,
            ]}
          >
            {option.label}
            {option.count !== undefined ? ` · ${option.count}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function TimeEmpty({
  title,
  body,
  icon = 'checkmark-circle-outline',
}: {
  title: string;
  body?: string;
  icon?: string;
}) {
  return (
    <View style={timeStyles.empty}>
      <Icon name={icon} size={30} color={timeColor.accent} />
      <Text style={timeStyles.sectionTitle}>{title}</Text>
      {body ? <Text style={timeStyles.body}>{body}</Text> : null}
    </View>
  );
}
export const timeStyles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: timeColor.canvas },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      paddingHorizontal: 20,
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
    },
    headerCopy: { flex: 1, minWidth: 160, gap: 4 },
    eyebrow: {
      color: timeColor.accent,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 30,
      lineHeight: 38,
      letterSpacing: -0.6,
      fontWeight: '800',
      color: timeColor.ink,
    },
    sectionTitle: {
      color: timeColor.ink,
      fontSize: 19,
      lineHeight: 25,
      fontWeight: '700',
    },
    body: { fontSize: 16, lineHeight: 24, color: timeColor.ink },
    caption: { fontSize: 14, lineHeight: 21, color: timeColor.muted },
    action: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: timeColor.inset,
    },
    primary: { backgroundColor: timeColor.fill },
    actionText: {
      color: timeColor.accent,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      flexShrink: 1,
    },
    primaryText: { color: timeColor.onFill },
    filters: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      padding: 4,
      borderRadius: 20,
      backgroundColor: timeColor.inset,
    },
    filter: {
      flex: 1,
      flexBasis: 96,
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 8,
      borderRadius: 16,
    },
    filterSelected: { backgroundColor: timeColor.surface },
    filterText: {
      color: timeColor.muted,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      textAlign: 'center',
    },
    filterSelectedText: { color: timeColor.ink, fontWeight: '800' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
    },
    section: { gap: 12, paddingVertical: 16 },
    divider: { borderBottomWidth: 1, borderColor: timeColor.line },
    badge: {
      alignSelf: 'flex-start',
      color: timeColor.accent,
      backgroundColor: timeColor.soft,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    empty: { paddingVertical: 32, gap: 12, alignItems: 'flex-start' },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.45 },
  }),
);
