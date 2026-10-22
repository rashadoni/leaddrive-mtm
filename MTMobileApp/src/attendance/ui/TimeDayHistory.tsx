import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AttendanceReceiptRow } from '../../services/attendance-receipt-contract';
import { themed } from '../../theme/fieldTheme';
import { timeColor, timeStyles } from './TimeUI';

/** A bounded view of actual device receipts, never a fabricated schedule or a duration estimate. */
export default function TimeDayHistory({
  rows,
  workdayId,
  failed,
  timezone,
}: {
  rows: AttendanceReceiptRow[];
  workdayId?: string;
  failed: boolean;
  timezone?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const current = workdayId
    ? rows.filter(row => row.workdayId === workdayId)
    : [];
  if (!current.length || failed) return null;
  const time = (value: string) =>
    new Date(value).toLocaleTimeString(i18n.language, {
      timeZone: timezone ?? 'UTC',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <View testID="time-day-history" style={styles.history}>
      <Text style={timeStyles.sectionTitle}>
        {t('attendanceRhythm.dayHistory')}
      </Text>
      <Text style={timeStyles.caption}>
        {t('attendanceRhythm.deviceHistoryHint')}
      </Text>
      {current.slice(-4).map(row => (
        <View
          key={row.operationId}
          testID={`time-history-${row.delivery.toLowerCase()}`}
          style={styles.row}
        >
          <View style={styles.marker}>
            <View
              style={[
                styles.dot,
                row.delivery !== 'RECEIVED' && styles.pendingDot,
              ]}
            />
          </View>
          <Text style={styles.time}>{time(row.occurredAt)}</Text>
          <View style={styles.copy}>
            <Text style={timeStyles.body}>
              {t(`attendanceReceipts.${row.action}`)}
            </Text>
            <Text
              style={[
                timeStyles.caption,
                row.delivery !== 'RECEIVED' && styles.warning,
              ]}
            >
              {t(`attendanceReceipts.${row.delivery}`)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
const styles = themed(() =>
  StyleSheet.create({
    history: { paddingTop: 24, paddingBottom: 8, gap: 12 },
    row: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      minHeight: 56,
    },
    marker: { width: 12, paddingTop: 9 },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: timeColor.accent,
    },
    pendingDot: { backgroundColor: timeColor.amber },
    time: {
      color: timeColor.muted,
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      minWidth: 48,
    },
    copy: { flex: 1, gap: 4 },
    warning: { color: timeColor.amber },
  }),
);
