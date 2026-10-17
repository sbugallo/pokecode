import { Plugin } from "@opencode/plugin/tui"
import { useKeyboard } from "@opentui/solid"
import { createComponent } from "solid-js/web"

export const serverPlugin = "server"
export const nativeControl = [useKeyboard, Plugin, createComponent]
