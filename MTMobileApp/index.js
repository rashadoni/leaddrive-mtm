/**
 * @format
 */

import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// An open workday keeps being recorded after the phone restarts or the app is
// updated: the native side starts the tracking service with this task
// (android/.../FieldTrackingResume.kt, src/services/tracking-resume.ts).
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('FieldResumeTracking', () => require('./src/services/tracking-resume').resumeTrackingTask);
}
