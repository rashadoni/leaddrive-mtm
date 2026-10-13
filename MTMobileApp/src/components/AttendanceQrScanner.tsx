import React from 'react'
export type AttendanceQrScannerProps={visible:boolean;scope:string;action:'START'|'FINISH';onClose:()=>void;onConfirm:(token:string)=>Promise<void>}
/** Load the native camera surface only after the explicit scan action. */
export default function AttendanceQrScanner(props:AttendanceQrScannerProps){
  if(!props.visible)return null
  const NativeScanner=require('./AttendanceQrScannerNative').default as React.ComponentType<AttendanceQrScannerProps>
  return <NativeScanner key={props.scope} {...props}/>
}
