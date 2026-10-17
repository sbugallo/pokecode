import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { Rpc } from "@opencode/plugin/rpc"
import { Plugin } from "@opencode/plugin/tui"
import { stringWidth as textWidth } from "bun"
import { tuiView } from "./view.js"

export const tuiPlugin = [tuiView, textWidth, Rpc, Plugin]
export type TuiTransport = RpcHandlers
