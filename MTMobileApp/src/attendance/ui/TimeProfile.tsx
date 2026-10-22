import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAttendanceInstallation } from '../../hooks/useAttendanceInstallation';
import AttendanceInstallationCard from '../../components/AttendanceInstallationCard';
import AttendanceLocationConsentCard from '../../components/AttendanceLocationConsentCard';
import AttendanceDisclosure from '../../components/AttendanceDisclosure';
import LightScreenStatusBar from '../../components/LightScreenStatusBar';
import StatusBarBand from '../../components/StatusBarBand';
import { upperInitial } from '../../lib/upper';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n';
import { themed } from '../../theme/fieldTheme';
import { TimeHeader, TimeAction, timeColor, timeStyles } from './TimeUI';

export default function TimeProfile({
  agent,
  server,
  headerTop,
  bottom,
  refreshing,
  failed,
  locale,
  pickLocale,
  hintsEnabled,
  setHintsEnabled,
  refresh,
  accountAction,
  version,
  children,
}: {
  agent: {
    name?: string;
    email?: string;
    phone?: string;
    organizationName?: string;
  } | null;
  server: string | null;
  headerTop: number;
  bottom: number;
  refreshing: boolean;
  failed: boolean;
  locale: SupportedLocale;
  pickLocale: (locale: SupportedLocale) => void;
  hintsEnabled: boolean;
  setHintsEnabled: (enabled: boolean) => void;
  refresh: () => void;
  accountAction: (action: 'logout' | 'switch') => void;
  version: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation(),
    installation = useAttendanceInstallation();
  return (
    <View style={timeStyles.screen}>
      <LightScreenStatusBar />
      <ScrollView
        contentContainerStyle={[
          timeStyles.content,
          { paddingTop: headerTop, paddingBottom: bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              refresh();
              void installation.reload();
            }}
            colors={[timeColor.accent]}
            tintColor={timeColor.accent}
          />
        }
      >
        <TimeHeader title={t('attendanceCompact.tabs.profile')} />
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.initial}>{upperInitial(agent?.name)}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={timeStyles.sectionTitle}>
              {agent?.name || agent?.email}
            </Text>
            {agent?.organizationName ? (
              <Text style={timeStyles.caption}>{agent.organizationName}</Text>
            ) : null}
          </View>
        </View>
        {failed && (
          <View style={styles.warning}>
            <Text accessibilityRole="alert" style={timeStyles.body}>
              {t('profile.loadError')}
            </Text>
            <TimeAction
              label={t('common.retry')}
              icon="refresh-outline"
              onPress={refresh}
            />
          </View>
        )}
        <View style={timeStyles.section}>
          <Text style={styles.label}>{t('attendanceRhythm.preferences')}</Text>
          <Text style={timeStyles.sectionTitle}>{t('profile.language')}</Text>
          <View style={styles.locales}>
            {SUPPORTED_LOCALES.map(language => (
              <Pressable
                key={language}
                testID={`time-language-${language}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: locale === language }}
                onPress={() => pickLocale(language)}
                style={({ pressed }) => [
                  styles.locale,
                  locale === language && styles.selected,
                  pressed && timeStyles.pressed,
                ]}
              >
                <Text
                  style={[
                    timeStyles.actionText,
                    locale === language && styles.selectedText,
                  ]}
                >
                  {t(
                    language === 'az'
                      ? 'profile.languageAz'
                      : language === 'en'
                      ? 'profile.languageEn'
                      : 'profile.languageRu',
                  )}
                  {locale === language ? ' ✓' : ''}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.hints}>
            <View style={styles.hintsCopy}>
              <Text style={timeStyles.body}>{t('profile.hintsShow')}</Text>
              <Text style={timeStyles.caption}>{t('profile.hintsNote')}</Text>
            </View>
            <Switch
              testID="time-hints"
              accessibilityLabel={t('profile.hintsShow')}
              value={hintsEnabled}
              onValueChange={setHintsEnabled}
              trackColor={{ false: timeColor.line, true: timeColor.soft }}
              thumbColor={hintsEnabled ? timeColor.accent : timeColor.muted}
            />
          </View>
        </View>
        <View style={timeStyles.section}>
          <Text style={styles.label}>
            {t('attendanceRhythm.devicePrivacy')}
          </Text>
          <AttendanceInstallationCard compact installation={installation} />
          {!installation.visible && (
            <Text style={timeStyles.caption}>
              {t('attendanceRhythm.devicePolicy')}
            </Text>
          )}
          <AttendanceLocationConsentCard compact />
          <Text style={timeStyles.caption}>
            {t('attendanceRhythm.permissionSeparate')}
          </Text>
        </View>
        <AttendanceDisclosure
          title={t('profile.contactInfoTitle')}
          icon="person-outline"
          controlID="time-contact-disclosure"
        >
          <Text style={timeStyles.caption}>{t('profile.infoEmail')}</Text>
          <Text style={timeStyles.body}>{agent?.email || '—'}</Text>
          <Text style={timeStyles.caption}>{t('profile.infoPhone')}</Text>
          <Text style={timeStyles.body}>{agent?.phone || '—'}</Text>
        </AttendanceDisclosure>
        <AttendanceDisclosure
          title={t('profile.connectionTitle')}
          summary={t(
            failed ? 'profile.statusNotConfirmed' : 'profile.statusConnected',
          )}
          icon="business-outline"
          controlID="time-connection-disclosure"
          attention={failed}
        >
          <Text style={timeStyles.caption}>{t('profile.infoServer')}</Text>
          <Text selectable style={timeStyles.body}>
            {server || '—'}
          </Text>
          <TimeAction
            testID="time-switch-company"
            icon="business-outline"
            label={t('profile.switchServer')}
            onPress={() => accountAction('switch')}
          />
        </AttendanceDisclosure>
        <TimeAction
          testID="time-logout"
          icon="log-out-outline"
          label={t('profile.logout')}
          onPress={() => accountAction('logout')}
        />
        <Text style={styles.version}>{version}</Text>
      </ScrollView>
      <StatusBarBand tone="light" />
      {children}
    </View>
  );
}
const styles = themed(() =>
  StyleSheet.create({
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 16,
    },
    identityCopy: { flex: 1, gap: 4 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 20,
      backgroundColor: timeColor.soft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    initial: { color: timeColor.accent, fontSize: 25, fontWeight: '800' },
    label: {
      color: timeColor.muted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    locales: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    locale: {
      minHeight: 48,
      flexGrow: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: timeColor.inset,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: timeColor.inset,
    },
    selected: {
      borderColor: timeColor.accent,
      backgroundColor: timeColor.soft,
    },
    selectedText: { color: timeColor.accent },
    hints: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    hintsCopy: { flex: 1, gap: 4 },
    warning: {
      backgroundColor: timeColor.amberSoft,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    version: {
      color: timeColor.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      paddingVertical: 24,
    },
  }),
);
