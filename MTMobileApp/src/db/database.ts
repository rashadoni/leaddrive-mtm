import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

import schema from './schema'
import { modelClasses } from './models'

/**
 * WatermelonDB SQLite adapter.
 *
 * jsi: true — enables JSI (synchronous) bindings for React Native 0.73+.
 *   Falls back to async bridge automatically if JSI is not available on device.
 *
 * After installation, run `cd android && ./gradlew app:generateDebugBuildConfig`
 * (or a full build) to pick up the native WatermelonDB module.
 *
 * iOS: cd ios && pod install
 */
const adapter = new SQLiteAdapter({
  schema,
  // migrations: undefined — none yet; will be added as schema version increments
  jsi: true,
  onSetUpError: (error) => {
    // In production, Sentry should capture this.
    // During development it typically means native module not linked yet.
    console.error('[WatermelonDB] Adapter setup failed:', error)
  },
})

/**
 * Singleton database instance.
 *
 * Usage:
 *   import { database } from '@/db'
 *   const customers = await database.collections.get<Customer>('customers').query().fetch()
 *
 * For reactive components, wrap with withObservables() from @nozbe/with-observables.
 */
export const database = new Database({
  adapter,
  modelClasses,
})
