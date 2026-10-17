import type { CoreWorkflow } from "../domain/core.js"

export type Workflow = CoreWorkflow
export const readFile = () => Bun.file("data.json").text()
export const globalNetwork = () => globalThis.fetch("https://example.com")
