import { usePlugin } from "@opencode/plugin/tui"
import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { For } from "solid-js"
import type { PokedexEntry } from "../../../../application/contracts/game.js"
import { bold } from "../components/action-button.js"

export const dexFooter = "↑↓: 1 item · ←→: 10 items · Esc: Close"

export function dexDisplayName(name: string, status: "caught" | "seen" | "unknown"): string {
  return status === "unknown" ? "----" : name
}

export function dexScrollDelta(key: string): number | undefined {
  switch (key) {
    case "up":
      return -1
    case "down":
      return 1
    case "left":
      return -10
    case "right":
      return 10
    default:
      return undefined
  }
}

export function dexModalWidth(terminalWidth: number): number {
  return Math.min(56, terminalWidth - 4)
}

export function isDexCloseKey(key: string): boolean {
  return key === "escape" || key === "esc"
}

export function PokemonDexDialog(properties: {
  readonly onClose: () => void
  readonly pokemon: readonly PokedexEntry[]
  readonly title: string
}) {
  const context = usePlugin()
  const dimensions = useTerminalDimensions()
  const height = () => Math.max(10, Math.floor(dimensions().height / 2) - 1)
  const width = () => dexModalWidth(dimensions().width)
  let scrollbox: ScrollBoxRenderable | undefined

  useKeyboard((event: KeyEvent) => {
    if (isDexCloseKey(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      properties.onClose()
      return
    }
    const delta = dexScrollDelta(event.name)
    if (delta === undefined || scrollbox === undefined) return
    event.preventDefault()
    event.stopPropagation()
    scrollbox.scrollBy(delta, "absolute")
  })

  return (
    <box flexDirection="column" height={height()} paddingLeft={1} paddingRight={1} width={width()}>
      <text attributes={bold} fg={context.theme.text.base} flexShrink={0}>
        {properties.title}
      </text>
      <box
        flexDirection="column"
        flexShrink={0}
        height={height() - 2}
        overflow="hidden"
        width="100%"
      >
        <scrollbox
          contentOptions={{ flexDirection: "column" }}
          flexGrow={1}
          flexShrink={1}
          id="pokecode-dex-scrollbox"
          minHeight={0}
          ref={(renderable) => {
            scrollbox = renderable
          }}
          scrollX={false}
          scrollY
          verticalScrollbarOptions={{ width: 1 }}
          viewportOptions={{
            flexDirection: "column",
            flexGrow: 1,
            flexShrink: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
          width="100%"
          wrapperOptions={{ flexDirection: "column", flexGrow: 1, flexShrink: 1, minHeight: 0 }}
        >
          <For each={properties.pokemon}>
            {(pokemon) => (
              <box flexDirection="row" width="100%">
                <text fg={pokemon.status === "caught" ? "#22c55e" : context.theme.text.muted}>
                  {pokemon.status === "unknown" ? "  " : "● "}
                </text>
                <text>
                  #{pokemon.number.toString().padStart(4, "0")}{" "}
                  {dexDisplayName(pokemon.name, pokemon.status)}
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </box>
      <text flexShrink={0}>{dexFooter}</text>
    </box>
  )
}
