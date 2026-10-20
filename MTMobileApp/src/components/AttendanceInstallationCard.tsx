import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { fieldTheme, themed } from '../theme/fieldTheme'
import type { useAttendanceInstallation } from '../hooks/useAttendanceInstallation'
export default function AttendanceInstallationCard({installation}:{installation:ReturnType<typeof useAttendanceInstallation>}) {
  const {t,i18n}=useTranslation(),{visible,own,pending,busy,failed}=installation
  if(!visible)return null
  const reason=own?.revocation?.reason??own?.decision?.reason
  const submittedAt=own?.submittedAt ? new Date(own.submittedAt).toLocaleString(i18n.language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : null
  return <View testID="attendance-installation-card" style={styles.card}>
    <Text style={styles.title}>{t('attendanceInstallation.title')}</Text>
    <Text style={styles.copy}>{t('attendanceInstallation.summary')}</Text>
    {own && <Text style={styles.state}>{t(`attendanceInstallation.${own.state}`)}</Text>}
    {own?.installationLabel && <Text style={styles.copy}>{own.installationLabel}</Text>}
    {submittedAt && <Text style={styles.copy}>{t('attendanceInstallation.submitted',{time:submittedAt})}</Text>}
    {reason && <Text style={styles.copy}>{reason}</Text>}
    <Text style={styles.copy}>{t('attendanceInstallation.noLocation')}</Text>
    {pending && <Text testID="attendance-installation-pending" style={styles.warning}>{t('attendanceInstallation.pendingUpload')}</Text>}
    {failed && <Text accessibilityRole="alert" style={styles.warning}>{t('attendanceInstallation.failed')}</Text>}
    {busy && <ActivityIndicator color={fieldTheme.color.primary}/>}
    {(pending || own?.canRequest===true) && <Pressable testID="attendance-installation-request" accessibilityRole="button" disabled={busy} onPress={()=>void installation.submit()} style={[styles.button,styles.primary,busy&&styles.disabled]}><Text style={styles.primaryText}>{t(pending?'attendanceInstallation.retry':'attendanceInstallation.request')}</Text></Pressable>}
    <Pressable testID="attendance-installation-refresh" accessibilityRole="button" disabled={busy} onPress={()=>void installation.reload()} style={[styles.button,busy&&styles.disabled]}><Text style={styles.buttonText}>{t('attendanceInstallation.refresh')}</Text></Pressable>
    <Text style={styles.copy}>{t('attendanceInstallation.newMark')}</Text>
  </View>
}
const styles=themed(() => StyleSheet.create({card:{backgroundColor:fieldTheme.color.surface,borderRadius:20,borderWidth:1,borderColor:fieldTheme.color.border,padding:20,gap:12},title:{fontSize:20,fontWeight:'700',color:fieldTheme.color.ink},copy:{fontSize:15,lineHeight:23,color:fieldTheme.color.inkMuted},state:{fontSize:16,fontWeight:'600',color:fieldTheme.color.primaryStrong},warning:{fontSize:15,lineHeight:23,color:fieldTheme.color.amber},button:{minHeight:50,padding:14,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:fieldTheme.color.border},primary:{backgroundColor:fieldTheme.color.primaryStrong},buttonText:{fontSize:16,fontWeight:'600',color:fieldTheme.color.primaryStrong,textAlign:'center'},primaryText:{fontSize:16,fontWeight:'600',color:fieldTheme.color.onColor,textAlign:'center'},disabled:{opacity:0.45}}))
