import { TimeText as Text } from "./TimeText"
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';
import type { AttendanceReceiptRow } from '../../services/attendance-receipt-contract';
import { themed } from '../../theme/fieldTheme';
import { timeColor } from './TimeUI';

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
      <View style={styles.heading}>
        <Text style={styles.title}>{t('attendanceRhythm.dayHistory')}</Text>
        <Text style={styles.provenance}>{t('attendanceRhythm.deviceHistoryHint')}</Text>
      </View>
      {current.slice(-4).map(row => (
        <View
          key={row.operationId}
          testID={`time-history-${row.delivery.toLowerCase()}`}
          accessible
          accessibilityLabel={`${t(`attendanceReceipts.${row.action}`)}, ${time(row.occurredAt)}, ${t(`attendanceReceipts.${row.delivery}`)}`}
          style={styles.row}
        >
          <Icon name={row.delivery === 'RECEIVED' ? 'checkmark-circle-outline' : 'time-outline'} size={18} color={row.delivery === 'RECEIVED' ? timeColor.accent : timeColor.amber} style={styles.marker} />
          <View style={styles.copy}>
            <Text style={styles.action}>
              {t(`attendanceReceipts.${row.action}`)}
            </Text>
            {row.delivery !== 'RECEIVED' && <Text style={[styles.provenance, styles.warning]}>
              {t(`attendanceReceipts.${row.delivery}`)}
            </Text>}
          </View>
          <Text style={styles.time}>{time(row.occurredAt)}</Text>
        </View>
      ))}
    </View>
  );
}
const styles = themed(() =>
  StyleSheet.create({
    history: { paddingVertical: 4, gap: 4 },
    heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 4, paddingBottom: 8 },
    title: { color: timeColor.ink, fontSize: 16, lineHeight: 23, fontWeight: '700' },
    provenance: { color: timeColor.muted, fontSize: 12, lineHeight: 18 },
    action: { color: timeColor.ink, fontSize: 14, lineHeight: 21 },
    row: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      minHeight: 36,
      paddingVertical: 6,
    },
    marker: { paddingTop: 2 },
    time: {
      color: timeColor.muted,
      fontSize: 13,
      lineHeight: 21,
      fontVariant: ['tabular-nums'],
      flexShrink: 0,
    },
    copy: { flex: 1, gap: 2 },
    warning: { color: timeColor.amber },
  }),
);
