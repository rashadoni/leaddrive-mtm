/**
 * WatermelonDB offline-first local database — public API surface.
 *
 * Import from here rather than from individual files:
 *   import { database, Customer, Route, Visit, Order } from 'src/db'
 */

export { database } from './database'
export * from './models'
export { default as schema } from './schema'
