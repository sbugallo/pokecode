import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"
import { Plugin as ServerPlugin } from "@opencode/plugin"
import { Effect } from "@opencode/plugin/effect"
import { Host } from "@opencode/plugin/host"
import { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { Rpc } from "@opencode/plugin/rpc"
import { Plugin as TuiPlugin } from "@opencode/plugin/tui"
import * as BunNamespace from "bun"
import { file } from "bun"

export { stringWidth } from "bun"

export const tuiPlugin = "tui"
export const loadDatabase = () => import("../../sqlite/database.js")
const hiddenModulePath = "../../sqlite/database.js"
export const loadHiddenModule = () => import(hiddenModulePath)
export const loadBunDynamically = () => import("bun")
export const loadBunWithRequire = () => require("bun")
export const forbiddenRuntimeDependencies = [
  ServerPlugin,
  Effect,
  Host,
  RpcHandlers,
  Rpc,
  TuiPlugin,
  readFileSync,
  Database,
  file,
  BunNamespace,
]
