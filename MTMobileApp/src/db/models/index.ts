export { Customer } from './Customer'
export { SkuCategory } from './SkuCategory'
export { Sku } from './Sku'
export { Route } from './Route'
export { RoutePoint } from './RoutePoint'
export { Visit } from './Visit'
export { Order } from './Order'
export { Task } from './Task'
export { OutboxOperation } from './OutboxOperation'

export type { CustomerCategory, CustomerStatus } from './Customer'
export type { RouteStatus } from './Route'
export type { RoutePointStatus } from './RoutePoint'
export type { VisitStatus } from './Visit'
export type { OrderStatus, OrderItem } from './Order'
export type { TaskStatus, TaskPriority } from './Task'
export type { OutboxOpType, OutboxEntity, OutboxStatus } from './OutboxOperation'

import { Customer } from './Customer'
import { SkuCategory } from './SkuCategory'
import { Sku } from './Sku'
import { Route } from './Route'
import { RoutePoint } from './RoutePoint'
import { Visit } from './Visit'
import { Order } from './Order'
import { Task } from './Task'
import { OutboxOperation } from './OutboxOperation'

/** All model classes — passed to Database constructor */
export const modelClasses = [
  Customer,
  SkuCategory,
  Sku,
  Route,
  RoutePoint,
  Visit,
  Order,
  Task,
  OutboxOperation,
]
