import { AppRegistry } from 'react-native';
import AttendanceApp from './src/attendance/AttendanceApp';
// Internal React root name only; Android package and storage are distinct.
AppRegistry.registerComponent('LeadDriveRouteField', () => AttendanceApp);
