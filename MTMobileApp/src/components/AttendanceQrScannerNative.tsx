import React,{useEffect,useRef,useState} from 'react'
import {ActivityIndicator,AppState,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native'
import {Camera,useCameraDevice,useCameraPermission,useCodeScanner} from 'react-native-vision-camera'
import {SafeAreaProvider,useSafeAreaInsets} from 'react-native-safe-area-context'
import {useTranslation} from 'react-i18next'
import {guardAttendanceQr} from '../services/attendance-qr'
import {validAttendanceQrToken} from '../services/attendance-qr-contract'
import { fieldTheme, themed } from '../theme/fieldTheme'
export type AttendanceQrScannerProps={visible:boolean;scope:string;action:'START'|'FINISH';onClose:()=>void;onConfirm:(token:string)=>Promise<void>}
export default function AttendanceQrScanner(props:AttendanceQrScannerProps){
  if(!props.visible)return null
  return <Modal visible animationType="slide" onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent><SafeAreaProvider><Scanner key={props.scope} {...props}/></SafeAreaProvider></Modal>
}
function Scanner({scope,action,onClose,onConfirm}:AttendanceQrScannerProps){
  const {t}=useTranslation(),insets=useSafeAreaInsets(),device=useCameraDevice('back'),{hasPermission,requestPermission}=useCameraPermission()
  const [token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[active,setActive]=useState(AppState.currentState==='active')
  const mounted=useRef(true),scanning=useRef(true),writing=useRef(false),requestingPermission=useRef(false),close=useRef(onClose)
  let admitted = false
  try { guardAttendanceQr(scope); admitted = true } catch { /* No camera for a stale admission. */ }
  close.current=onClose
  const current=()=>{if(!mounted.current||AppState.currentState!=='active')throw new Error('ATTENDANCE_QR_CLOSED');guardAttendanceQr(scope)}
  useEffect(()=>{mounted.current=true;const listener=AppState.addEventListener('change',state=>{setActive(state==='active');if(state!=='active'){scanning.current=false;setToken(null);if(!requestingPermission.current)close.current()}});return()=>{mounted.current=false;listener.remove()}},[])
  const scanner=useCodeScanner({codeTypes:['qr'],onCodeScanned:codes=>{
    if(!scanning.current||writing.current)return
    try{current();const next=codes.find(code=>code.type==='qr'&&validAttendanceQrToken(code.value))?.value;if(!next){setFailed(true);return}scanning.current=false;setToken(next);setFailed(false)}catch{/* A late camera callback never becomes a new action. */}
  }})
  async function requestCamera(){
    if(requestingPermission.current)return
    try{
      current();requestingPermission.current=true
      // Android's permission activity temporarily backgrounds this screen.
      // Keep the modal, but never keep the camera or a scanned token active.
      const granted=await requestPermission();current()
      scanning.current=granted
      if(!granted)setFailed(true)
    }catch{if(mounted.current)setFailed(true)}
    finally{
      requestingPermission.current=false
      // A real departure while the permission prompt was open still closes it.
      if(mounted.current&&AppState.currentState!=='active')close.current()
    }
  }
  async function confirm(){if(!token||writing.current)return;writing.current=true;setBusy(true);setFailed(false);try{current();await onConfirm(token);if(mounted.current){setToken(null);onClose()}}catch{if(mounted.current)setFailed(true)}finally{writing.current=false;if(mounted.current)setBusy(false)}}
  function rescan(){if(writing.current)return;try{current();scanning.current=true;setToken(null);setFailed(false)}catch{onClose()}}
  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content,{paddingTop:insets.top+24,paddingBottom:insets.bottom+24}]}>
    <Text style={styles.title}>{t(token?(action==='START'?'attendanceQr.confirmStart':'attendanceQr.confirmFinish'):'attendanceQr.scanTitle')}</Text>
    {token ? <><Text style={styles.state}>{t('attendanceQr.scanned')}</Text><Text style={styles.copy}>{t('attendanceQr.checkAtSend')}</Text><Pressable testID="attendance-qr-confirm" accessibilityRole="button" disabled={busy} style={styles.primary} onPress={()=>void confirm()}><Text style={styles.primaryText}>{t(action==='START'?'attendanceQr.confirmStart':'attendanceQr.confirmFinish')}</Text></Pressable><Pressable testID="attendance-qr-rescan" accessibilityRole="button" disabled={busy} style={styles.button} onPress={rescan}><Text style={styles.buttonText}>{t('attendanceQr.rescan')}</Text></Pressable><Text style={styles.copy}>{t('attendanceQr.offline')}</Text></>
    : !admitted ? <Text style={styles.error}>{t('attendanceQr.failed')}</Text>
    : !hasPermission || !device ? <><Text style={styles.copy}>{t(!hasPermission?'attendanceQr.permission':'attendanceQr.noCamera')}</Text>{!hasPermission && <Pressable testID="attendance-qr-permission" accessibilityRole="button" style={styles.primary} onPress={()=>void requestCamera()}><Text style={styles.primaryText}>{t('attendanceQr.allowCamera')}</Text></Pressable>}</>
    : <><Text style={styles.copy}>{t('attendanceQr.aim')}</Text><View style={styles.camera}><Camera testID="attendance-qr-camera" style={StyleSheet.absoluteFill} device={device} isActive={active && !busy} codeScanner={scanner}/></View><Text style={styles.copy}>{t('attendanceQr.privacy')}</Text></>}
    {failed && <Text accessibilityRole="alert" style={styles.error}>{t('attendanceQr.failed')}</Text>}
    {busy && <ActivityIndicator color={fieldTheme.color.primary}/>}
    <Pressable testID="attendance-qr-cancel" accessibilityRole="button" disabled={busy} style={styles.button} onPress={()=>{scanning.current=false;setToken(null);onClose()}}><Text style={styles.buttonText}>{t('attendanceQr.cancel')}</Text></Pressable>
  </ScrollView></View>
}
const styles=themed(() => StyleSheet.create({screen:{flex:1,backgroundColor:fieldTheme.color.canvas},content:{paddingHorizontal:24,gap:20,maxWidth:640,width:'100%',alignSelf:'center'},title:{fontSize:27,lineHeight:34,fontWeight:'700',color:fieldTheme.color.primaryStrong},state:{fontSize:20,fontWeight:'700',color:fieldTheme.color.primaryStrong},copy:{fontSize:16,lineHeight:24,color:fieldTheme.color.inkMuted},camera:{height:320,overflow:'hidden',borderRadius:20,backgroundColor:fieldTheme.color.primaryStrong},button:{minHeight:52,padding:14,borderRadius:12,borderWidth:1,borderColor:fieldTheme.color.border,backgroundColor:fieldTheme.color.surface,justifyContent:'center',alignItems:'center'},primary:{minHeight:52,padding:14,borderRadius:12,backgroundColor:fieldTheme.color.primaryStrong,justifyContent:'center',alignItems:'center'},buttonText:{fontSize:16,fontWeight:'700',color:fieldTheme.color.primaryStrong,textAlign:'center'},primaryText:{fontSize:16,fontWeight:'700',color:fieldTheme.color.onColor,textAlign:'center'},error:{fontSize:15,lineHeight:23,color:fieldTheme.color.danger}}))
