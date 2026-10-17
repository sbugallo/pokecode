import type { Workflow } from "../application/workflow.js"

export type CoreWorkflow = Workflow
export const remoteLookup = () => fetch("https://example.com")
export const runtimeHome = () => process.env.HOME
