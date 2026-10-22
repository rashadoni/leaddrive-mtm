import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { attendanceDate } from '../../services/attendance-contract';
import { formatLocalizedDate } from '../../lib/format-localized-date';
import { TimeAction, timeColor, timeStyles } from './TimeUI';
import { themed } from '../../theme/fieldTheme';

/** Civil company dates only: UTC arithmetic never converts them into the phone's day. */
export function calendarDays(month: string): (string | null)[] {
  if (!attendanceDate(`${month}-01`)) return [];
  const first = new Date(`${month}-01T00:00:00Z`),
    offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
}
export function adjacentMonth(month: string, offset: number): string {
  const first = new Date(`${month}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + offset);
  return first.toISOString().slice(0, 7);
}
export default function TimeDateField({
  value,
  label,
  testID,
  disabled,
  time = false,
  onChange,
}: {
  value: string;
  label: string;
  testID: string;
  disabled: boolean;
  time?: boolean;
  onChange: (value: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { width, height, fontScale } = useWindowDimensions(),
    dateList = (Math.min(width - 24, 520) - 32) / 7 < 48 || fontScale > 1.3;
  const optionHeight = Math.max(48, Math.ceil(24 * fontScale) + 8);
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState('2000-01');
  const [chosen, setChosen] = useState(value),
    [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled?.().then(reduce => {
      if (mounted) setReduceMotion(reduce);
    });
    const listener = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      listener?.remove();
    };
  }, []);
  const show = () => {
    setChosen(value);
    if (!time && attendanceDate(value)) setMonth(value.slice(0, 7));
    setOpen(true);
  };
  const hour = /^\d{2}:\d{2}$/.test(chosen) ? chosen.slice(0, 2) : '09',
    minute = /^\d{2}:\d{2}$/.test(chosen) ? chosen.slice(3) : '00';
  const dateText = (date: string) =>
    formatLocalizedDate(date, i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const hours = useRef<ScrollView>(null),
    minutes = useRef<ScrollView>(null);
  const cells = calendarDays(month);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${time ? value : dateText(value)}`}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={show}
        style={({ pressed }) => [styles.input, pressed && timeStyles.pressed]}
      >
        <Text style={[timeStyles.body, styles.fieldValue]}>
          {time ? value : dateText(value)}
        </Text>
        <Text style={styles.indicator}>{time ? '◷' : '▦'}</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.scrim}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={timeStyles.sectionTitle}>
              {label}
            </Text>
            {time ? (
              <ScrollView
                testID="time-picker-scroll"
                nestedScrollEnabled
                contentContainerStyle={styles.timeContent}
                style={styles.pickerScroll}
              >
                <Text testID="time-picker-value" style={styles.preview}>
                  {hour}:{minute}
                </Text>
                <View style={styles.timeColumns}>
                  {(['hour', 'minute'] as const).map((part, column) => (
                    <View key={part} style={styles.timeColumn}>
                      <Text style={styles.label}>
                        {t(`attendanceRhythm.${part}`)}
                      </Text>
                      <ScrollView
                        nestedScrollEnabled
                        ref={column === 0 ? hours : minutes}
                        onLayout={() =>
                          (column === 0 ? hours : minutes).current?.scrollTo({
                            y:
                              Number(column === 0 ? hour : minute) *
                              optionHeight,
                            animated: false,
                          })
                        }
                        style={[
                          styles.timeScroll,
                          { height: Math.max(96, Math.min(240, height * 0.3)) },
                        ]}
                      >
                        {Array.from(
                          { length: column === 0 ? 24 : 60 },
                          (_, index) => String(index).padStart(2, '0'),
                        ).map(number => (
                          <Pressable
                            key={number}
                            testID={`time-picker-${part}-${number}`}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected:
                                number === (column === 0 ? hour : minute),
                            }}
                            onPress={() =>
                              setChosen(
                                column === 0
                                  ? `${number}:${minute}`
                                  : `${hour}:${number}`,
                              )
                            }
                            style={[
                              styles.timeOption,
                              { minHeight: optionHeight },
                              number === (column === 0 ? hour : minute) &&
                                styles.selected,
                            ]}
                          >
                            <Text style={timeStyles.body}>{number}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ))}
                </View>
                <TimeAction
                  testID="time-picker-confirm"
                  label={t('attendanceRhythm.select')}
                  primary
                  onPress={() => {
                    onChange(`${hour}:${minute}`);
                    setOpen(false);
                  }}
                />
              </ScrollView>
            ) : (
              <ScrollView style={styles.pickerScroll}>
                <View style={styles.month}>
                  <TimeAction
                    testID="calendar-previous"
                    iconOnly
                    label={t('attendanceRhythm.previousMonth')}
                    icon="chevron-back"
                    onPress={() => setMonth(adjacentMonth(month, -1))}
                    style={styles.monthAction}
                  />
                  <Text
                    testID={`calendar-month-${month}`}
                    style={styles.monthTitle}
                  >
                    {formatLocalizedDate(`${month}-01`, i18n.language, {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </Text>
                  <TimeAction
                    testID="calendar-next"
                    iconOnly
                    label={t('attendanceRhythm.nextMonth')}
                    icon="chevron-forward"
                    onPress={() => setMonth(adjacentMonth(month, 1))}
                    style={styles.monthAction}
                  />
                </View>
                {!dateList && (
                  <View style={styles.week}>
                    {Array.from({ length: 7 }, (_, index) => (
                      <Text key={index} style={styles.weekday}>
                        {formatLocalizedDate(
                          new Date(Date.UTC(2026, 0, 5 + index)),
                          i18n.language,
                          { weekday: 'short', timeZone: 'UTC' },
                        )}
                      </Text>
                    ))}
                  </View>
                )}
                {dateList ? (
                  <View style={styles.dateList}>
                    {cells
                      .filter((date): date is string => !!date)
                      .map(date => (
                        <Pressable
                          key={date}
                          testID={`calendar-${date}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: date === value }}
                          onPress={() => {
                            onChange(date);
                            setOpen(false);
                          }}
                          style={({ pressed }) => [
                            styles.dateOption,
                            date === value && styles.selected,
                            pressed && timeStyles.pressed,
                          ]}
                        >
                          <Text style={timeStyles.body}>{dateText(date)}</Text>
                        </Pressable>
                      ))}
                  </View>
                ) : (
                  Array.from(
                    { length: Math.ceil(cells.length / 7) },
                    (_, week) => (
                      <View key={week} style={styles.week}>
                        {Array.from({ length: 7 }, (unused, column) => {
                          const date = cells[week * 7 + column];
                          return date ? (
                            <Pressable
                              key={column}
                              testID={`calendar-${date}`}
                              accessibilityLabel={dateText(date)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: date === value }}
                              onPress={() => {
                                onChange(date);
                                setOpen(false);
                              }}
                              style={({ pressed }) => [
                                styles.day,
                                date === value && styles.selected,
                                pressed && timeStyles.pressed,
                              ]}
                            >
                              <Text style={timeStyles.body}>
                                {Number(date.slice(-2))}
                              </Text>
                            </Pressable>
                          ) : (
                            <View key={column} style={styles.day} />
                          );
                        })}
                      </View>
                    ),
                  )
                )}
              </ScrollView>
            )}
            <TimeAction
              testID="time-picker-close"
              label={t('common.cancel')}
              onPress={() => setOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = themed(() =>
  StyleSheet.create({
    fieldValue: { flex: 1, minWidth: 0 },
    pickerScroll: { flexShrink: 1 },
    timeContent: { gap: 16 },
    field: { flexGrow: 1, flexBasis: 180, gap: 8 },
    label: {
      color: timeColor.muted,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '700',
    },
    input: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: timeColor.inset,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    indicator: { color: timeColor.accent, fontSize: 22 },
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(8,20,14,0.60)',
      justifyContent: 'center',
      padding: 12,
    },
    sheet: {
      maxHeight: '94%',
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      backgroundColor: timeColor.surface,
      padding: 16,
      borderRadius: 24,
      gap: 16,
    },
    month: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 16,
    },
    monthTitle: {
      color: timeColor.ink,
      fontSize: 17,
      fontWeight: '700',
      flexGrow: 1,
      textAlign: 'center',
    },
    monthAction: { width: 48, paddingHorizontal: 8 },
    week: { flexDirection: 'row' },
    weekday: {
      flex: 1,
      textAlign: 'center',
      color: timeColor.muted,
      fontSize: 12,
      paddingVertical: 8,
    },
    day: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 12,
    },
    selected: {
      backgroundColor: timeColor.soft,
      borderWidth: 1,
      borderColor: timeColor.accent,
    },
    dateList: { gap: 8 },
    dateOption: { minHeight: 48, padding: 12, borderRadius: 12 },
    preview: {
      fontSize: 30,
      lineHeight: 38,
      fontWeight: '800',
      textAlign: 'center',
      color: timeColor.ink,
      fontVariant: ['tabular-nums'],
    },
    timeColumns: { flexDirection: 'row', gap: 16 },
    timeColumn: { flex: 1, gap: 8 },
    timeScroll: { maxHeight: 240 },
    timeOption: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
    },
  }),
);
