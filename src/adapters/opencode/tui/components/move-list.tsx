import {
  type BoxRenderable,
  type KeyEvent,
  MouseButton,
  type MouseEvent,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { createSignal, For, Show } from "solid-js"
import type { Move } from "../../../../domain/pokemon/types.js"
import type { Language } from "../../../../domain/shared/language.js"
import { moveInspectionHint, presentMove } from "../../../presentation/move-details.js"
import { fallbackPokecodeTheme, type PokecodeSurface } from "../theme.js"
import "../controls/native.js"

export function MoveList(properties: {
  readonly moves: readonly Move[]
  readonly language: Language
  readonly offeredMoveId?: string
  readonly height?: number
  readonly centered?: boolean
  readonly leftAlignMoves?: boolean
  readonly onActivate?: (moveId: string) => Promise<void>
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const [hovered, setHovered] = createSignal<string | null>(null)
  const [inspected, setInspected] = createSignal<string | null>(null)
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const moves = () => properties.moves.map((move) => presentMove(move, properties.language))
  const description = () => moves().find((move) => move.id === inspected())?.description
  let list: ScrollBoxRenderable | undefined
  let descriptionBox: ScrollBoxRenderable | undefined
  const inspect = (id: string) => {
    setHovered(id)
    if (inspected() !== id) {
      setInspected(id)
      descriptionBox?.scrollTo(0)
    }
  }
  const rows = () => (
    <For each={moves()}>
      {(move) => {
        let row: BoxRenderable | undefined
        const focus = () => {
          inspect(move.id)
          if (list !== undefined && row !== undefined) {
            const offset = row.y - list.viewport.y
            if (offset < 0) list.scrollBy(offset, "absolute")
            else if (offset + row.height > list.viewport.height) {
              list.scrollBy(offset + row.height - list.viewport.height, "absolute")
            }
          }
        }
        const secondary = () => move.id === properties.offeredMoveId
        const action = () => (secondary() ? surface().secondary : surface().primary)
        const hoveredRow = () => hovered() === move.id
        return (
          <box
            ref={(value) => {
              row = value
            }}
            flexDirection="column"
            alignItems={properties.leftAlignMoves ? "flex-start" : "center"}
            flexShrink={0}
            width="100%"
          >
            <button
              id={`move-${move.id}`}
              type="button"
              focusable
              maxWidth="100%"
              paddingLeft={2}
              paddingRight={2}
              justifyContent="center"
              backgroundColor={hoveredRow() ? action().backgroundHovered : action().background}
              onMouseOver={() => inspect(move.id)}
              onMouseOut={() => setHovered(null)}
              onFocus={focus}
              onBlur={() => setHovered(null)}
              onMouseUp={(event: MouseEvent) => {
                if (event.button !== MouseButton.LEFT) return
                inspect(move.id)
                if (properties.onActivate !== undefined) void properties.onActivate(move.id)
              }}
              onKeyDown={(event: KeyEvent) => {
                if (
                  properties.onActivate === undefined ||
                  !["return", "space"].includes(event.name)
                )
                  return
                event.preventDefault()
                event.stopPropagation()
                void properties.onActivate(move.id)
              }}
            >
              <text
                fg={hoveredRow() ? action().labelHovered : action().label}
                wrapMode="word"
                textAlign={properties.centered && !properties.leftAlignMoves ? "center" : "left"}
              >
                {move.name}
              </text>
            </button>
            <text
              fg={surface().muted}
              maxWidth="100%"
              wrapMode="word"
              textAlign={properties.centered && !properties.leftAlignMoves ? "center" : "left"}
            >
              {move.classification}
            </text>
            <text
              fg={surface().muted}
              maxWidth="100%"
              wrapMode="word"
              textAlign={properties.centered && !properties.leftAlignMoves ? "center" : "left"}
            >
              {move.stats}
            </text>
          </box>
        )
      }}
    </For>
  )
  return (
    <box
      flexDirection="column"
      gap={1}
      width="100%"
      height={properties.height ?? "auto"}
      minWidth={0}
      flexShrink={0}
    >
      <Show
        when={properties.height !== undefined}
        fallback={
          <box flexDirection="column" gap={1} width="100%">
            {rows()}
          </box>
        }
      >
        <scrollbox
          ref={(value) => {
            list = value
          }}
          flexGrow={1}
          minHeight={3}
          scrollX={false}
          scrollY
          contentOptions={{ flexDirection: "column", gap: 1 }}
          viewportOptions={{ minHeight: 0, overflow: "hidden" }}
        >
          {rows()}
        </scrollbox>
      </Show>
      <scrollbox
        ref={(value) => {
          descriptionBox = value
        }}
        height={
          properties.height === undefined
            ? 6
            : Math.min(6, Math.max(2, Math.floor(properties.height / 4)))
        }
        flexShrink={0}
        width="100%"
        scrollX={false}
        scrollY
        contentOptions={{ flexDirection: "column" }}
        viewportOptions={{ minHeight: 0, overflow: "hidden" }}
      >
        <text
          fg={surface().text}
          width="100%"
          wrapMode="word"
          textAlign={properties.centered ? "center" : "left"}
        >
          {description() || moveInspectionHint(properties.language)}
        </text>
      </scrollbox>
    </box>
  )
}
