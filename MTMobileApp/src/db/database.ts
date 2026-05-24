import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'
import * as Sentry from '@sentry/react-native'

import schema from './schema'
import { modelClasses } from './models'

/**
 * WatermelonDB SQLite adapter.
 *
 * jsi: true — enables JSI (synchronous) bindings for React Native 0.73+.
 *   Falls back to async bridge automatically if JSI is not available on device.
 *
 * After `npm install`:
 *   Android: autolinking via react-native.config.js → native/android (no manual gradle step needed since 0.27)
 *   iOS:     cd ios && pod install
 */
const adapter = new SQLiteAdapter({
  schema,
  /**
   * Empty migration list for schema v1 — expand when schema version increments.
   * Pattern: schemaMigrations({ migrations: [{ toVersion: 2, steps: [...] }] })
   */
  migrations: schemaMigrations({ migrations: [] }),
  jsi: true,
  onSetUpError: (error) => {
    Sentry.captureException(error, {
      tags: { module: 'watermelondb', phase: 'setup' },
    })
    // Also log to console so developers see it during builds
    console.error('[WatermelonDB] Adapter setup failed:', error)
  },
})

/**
 * Singleton database instance.
 *
 * Usage:
 *   import { database } from 'src/db'
 *   const customers = await database.collections.get<Customer>('customers').query().fetch()
 *
 * For reactive components, wrap with withObservables() from @nozbe/with-observables.
 *
 * For tests: use LokiJSAdapter from @nozbe/watermelondb/adapters/lokijs instead.
 */
export const database = new Database({
  adapter,
  modelClasses,
})
