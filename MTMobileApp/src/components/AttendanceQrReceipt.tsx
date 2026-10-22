import React from 'react'
import {StyleSheet,Text,View} from 'react-native'
import {useTranslation} from 'react-i18next'
import type {SavedAttendanceQrReceipt} from '../services/attendance-qr-contract'
import { fieldTheme, themed } from '../theme/fieldTheme'
export default function AttendanceQrReceipt({receipts,embedded=false}:{receipts:SavedAttendanceQrReceipt[];embedded?:boolean}) {
  const {t}=useTranslation()
  const latest = receipts.filter(row=>row.action==='FINISH').slice(-1)[0] ?? receipts.filter(row=>row.action==='START').slice(-1)[0]
  if(!latest)return null
  return <View testID="attendance-qr-receipt" style={embedded?styles.inline:styles.box}>
    <Text style={styles.title}>{t(latest.action==='START'?'attendanceQr.startReceipt':'attendanceQr.finishReceipt')}</Text>
    <Text style={styles.state}>{t(latest.state==='VERIFIED'?'attendanceQr.verified':'attendanceQr.notVerified')}</Text>
    {latest.branch && <Text style={styles.copy}>{latest.branch.name}</Text>}
    <Text style={styles.copy}>{t(latest.state==='VERIFIED'?'attendanceQr.thisMark':`attendanceQr.${latest.state}`)}</Text>
  </View>
}
const styles=themed(() => StyleSheet.create({inline:{gap:8},box:{padding:20,gap:10,borderRadius:20,borderWidth:1,borderColor:fieldTheme.color.border,backgroundColor:fieldTheme.color.surface},title:{fontSize:16,fontWeight:'700',color:fieldTheme.color.ink},state:{fontSize:18,fontWeight:'700',color:fieldTheme.color.primaryStrong},copy:{fontSize:15,lineHeight:23,color:fieldTheme.color.inkMuted}}))
