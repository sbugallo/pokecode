// biome-ignore lint/correctness/noUnusedImports: This empty import verifies the emitted runtime edge.
import {} from "../../sqlite/empty-connection.js"
// biome-ignore lint/style/useImportType: Inline type specifiers remain runtime module edges.
import { type ImportedConnection } from "../../sqlite/type-connection.js"

// biome-ignore lint/style/useExportType: Inline type exports remain runtime module edges.
export { type ReexportedConnection } from "../../sqlite/reexport-connection.js"

export const view = "view"
export type VerbatimTypes = ImportedConnection
