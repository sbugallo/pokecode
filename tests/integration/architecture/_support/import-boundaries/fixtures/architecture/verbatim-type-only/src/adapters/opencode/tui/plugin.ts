import type { Connection } from "../../sqlite/connection.js"

export type { Connection } from "../../sqlite/connection.js"

export const view = (connection: Connection) => connection.id
