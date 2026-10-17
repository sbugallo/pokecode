import { Plugin as ServerPlugin } from "@opencode/plugin"
import { file } from "bun"
import { createStore } from "solid-js/store"
import { valueFromFilesystemBridge } from "../../../filesystem-bridge.js"
import { serverPlugin } from "../server/plugin.js"

export const contract = [serverPlugin, valueFromFilesystemBridge, ServerPlugin, file, createStore]
