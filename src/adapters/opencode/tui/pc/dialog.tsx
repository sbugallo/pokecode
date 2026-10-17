import {
  createTextAttributes,
  type KeyEvent,
  MouseButton,
  type MouseEvent,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import type { Accessor } from "solid-js"
import { createSignal, For, Show } from "solid-js"
import type { PokemonManagementResult } from "../../../../application/contracts/game.js"
import type { PokemonInstance } from "../../../../domain/pokemon/model.js"
import type { Language } from "../../../../domain/shared/language.js"
import { pcCopy } from "../../../presentation/pc-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import { createOwnerGuard } from "../components/owner.js"
import { PcDetails } from "./details.js"
import "../controls/native.js"

const bold = createTextAttributes({ bold: true })

export function PokemonPcDialog(properties: {
  readonly pokemon: readonly PokemonInstance[]
  readonly partyIds: readonly string[]
  readonly language: Language
  readonly textColor: string | Accessor<string>
  readonly mutedColor: string | Accessor<string>
  readonly onClose: () => void
  readonly onConfirm: (pokemonIds: readonly string[]) => Promise<boolean>
  readonly onRename: (pokemonId: string, name: string) => Promise<PokemonManagementResult["kind"]>
  readonly onRelease: (pokemonId: string) => Promise<PokemonManagementResult["kind"]>
  readonly resolveSprite: SpriteResolver
}) {
  const dimensions = useTerminalDimensions()
  const height = () => Math.min(44, Math.max(1, dimensions().height - 6))
  const [index, setIndex] = createSignal(0)
  const [selected, setSelected] = createSignal<readonly string[]>([...properties.partyIds])
  const [busy, setBusy] = createSignal(false)
  const [feedback, setFeedback] = createSignal("")
  const [mode, setMode] = createSignal<"browse" | "rename" | "release">("browse")
  const [name, setName] = createSignal("")
  const isOwned = createOwnerGuard()
  const copy = () => pcCopy(properties.language)
  const textColor = () =>
    typeof properties.textColor === "function" ? properties.textColor() : properties.textColor
  const mutedColor = () =>
    typeof properties.mutedColor === "function" ? properties.mutedColor() : properties.mutedColor
  const inspected = () => properties.pokemon[index()]
  let list: ScrollBoxRenderable | undefined
  let details: ScrollBoxRenderable | undefined

  const inspect = (next: number) => {
    setIndex(Math.max(0, Math.min(properties.pokemon.length - 1, next)))
    details?.scrollTo(0)
    if (list === undefined) return
    if (index() < list.scrollTop) list.scrollTo(index())
    else if (index() >= list.scrollTop + list.viewport.height) {
      list.scrollTo(index() - list.viewport.height + 1)
    }
  }
  const toggle = (id: string) => {
    if (busy() || mode() !== "browse") return
    setFeedback("")
    if (selected().includes(id)) {
      setSelected(selected().filter((pokemonId) => pokemonId !== id))
    } else if (selected().length < 6) {
      setSelected([...selected(), id])
    } else {
      setFeedback(copy().maximum)
    }
  }
  const confirm = async () => {
    if (busy()) return
    if (selected().length === 0) {
      setFeedback(copy().minimum)
      return
    }
    setBusy(true)
    setFeedback(copy().saving)
    try {
      if (await properties.onConfirm(selected())) {
        if (isOwned()) properties.onClose()
      } else if (isOwned()) setFeedback(copy().failed)
    } catch (error) {
      if (isOwned()) setFeedback(error instanceof Error ? error.message : copy().failed)
    } finally {
      if (isOwned()) setBusy(false)
    }
  }

  const begin = (action: "rename" | "release") => {
    const pokemon = inspected()
    if (busy() || mode() !== "browse" || pokemon === undefined) return
    setFeedback("")
    setName(pokemon.name)
    setMode(action)
  }
  const manage = async () => {
    const pokemon = inspected()
    const action = mode()
    if (busy() || pokemon === undefined || action === "browse") return
    setBusy(true)
    setFeedback(copy().managing)
    try {
      const result =
        action === "rename"
          ? await properties.onRename(pokemon.id, name())
          : await properties.onRelease(pokemon.id)
      if (!isOwned()) return
      if (result === "renamed" || result === "released") {
        if (result === "released") {
          setSelected(selected().filter((id) => id !== pokemon.id))
          inspect(index())
        }
        setMode("browse")
        setFeedback(result === "renamed" ? copy().renamed : copy().released)
      } else {
        setFeedback(
          result === "invalid-name"
            ? copy().invalidName
            : result === "last-party-pokemon"
              ? copy().lastPartyPokemon
              : copy().managementFailed,
        )
      }
    } catch (error) {
      if (isOwned()) setFeedback(error instanceof Error ? error.message : copy().managementFailed)
    } finally {
      if (isOwned()) setBusy(false)
    }
  }

  useKeyboard((event: KeyEvent) => {
    if (mode() !== "browse") {
      // Leave text editing keys to the focused input, but never let them alter the party draft.
      if (!["return", "escape", "esc"].includes(event.name)) return
      event.preventDefault()
      event.stopPropagation()
      if (busy()) return
      if (event.name === "return") void manage()
      else {
        setMode("browse")
        setFeedback("")
      }
      return
    }
    if (
      !["up", "down", "left", "right", "space", "return", "escape", "esc", "r", "f"].includes(
        event.name,
      )
    )
      return
    event.preventDefault()
    event.stopPropagation()
    if (busy()) return
    switch (event.name) {
      case "r":
        begin("rename")
        break
      case "f":
        begin("release")
        break
      case "up":
        inspect(index() - 1)
        break
      case "down":
        inspect(index() + 1)
        break
      case "left":
        details?.scrollBy(-3, "absolute")
        break
      case "right":
        details?.scrollBy(3, "absolute")
        break
      case "space": {
        const pokemon = inspected()
        if (pokemon !== undefined) toggle(pokemon.id)
        break
      }
      case "return":
        void confirm()
        break
      case "escape":
      case "esc":
        properties.onClose()
        break
    }
  })

  return (
    <box flexDirection="column" height={height()} paddingLeft={1} paddingRight={1} width="100%">
      <text attributes={bold} fg={textColor()} flexShrink={0}>
        {`${copy().title} (${selected().length}/6)`}
      </text>
      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} width="100%">
        <box
          flexDirection="column"
          flexShrink={0}
          minHeight={0}
          minWidth={0}
          height="100%"
          width="40%"
        >
          <scrollbox
            ref={(renderable) => {
              list = renderable
            }}
            id="pokecode-pc-list"
            flexGrow={1}
            minHeight={0}
            scrollX={false}
            scrollY
            contentOptions={{ flexDirection: "column" }}
            viewportOptions={{ minHeight: 0, overflow: "hidden" }}
          >
            <For each={properties.pokemon}>
              {(pokemon, row) => (
                <box flexDirection="row" flexShrink={0} height={1}>
                  <button
                    type="button"
                    onMouseUp={(event: MouseEvent) => {
                      if (event.button !== MouseButton.LEFT || busy() || mode() !== "browse") return
                      inspect(row())
                      toggle(pokemon.id)
                    }}
                  >
                    <text fg={selected().includes(pokemon.id) ? "#22c55e" : mutedColor()}>
                      {selected().includes(pokemon.id) ? "● " : "○ "}
                    </text>
                  </button>
                  <button
                    type="button"
                    flexGrow={1}
                    backgroundColor={index() === row() ? "#2563eb" : undefined}
                    onMouseUp={(event: MouseEvent) => {
                      if (event.button === MouseButton.LEFT && !busy() && mode() === "browse")
                        inspect(row())
                    }}
                  >
                    <text fg={index() === row() ? "#ffffff" : textColor()}>
                      {`${pokemon.name} Lv.${pokemon.level}`}
                    </text>
                  </button>
                </box>
              )}
            </For>
            <Show when={properties.pokemon.length === 0}>
              <text>{copy().empty}</text>
            </Show>
          </scrollbox>
        </box>
        <scrollbox
          ref={(renderable) => {
            details = renderable
          }}
          id="pokecode-pc-details"
          flexGrow={1}
          width={0}
          minHeight={0}
          minWidth={0}
          scrollX={false}
          scrollY
          contentOptions={{ flexDirection: "column" }}
          viewportOptions={{ minHeight: 0, overflow: "hidden" }}
        >
          <Show when={inspected()} keyed>
            {(pokemon: PokemonInstance) => (
              <PcDetails
                pokemon={pokemon}
                language={properties.language}
                textColor={textColor()}
                resolveSprite={properties.resolveSprite}
              />
            )}
          </Show>
        </scrollbox>
      </box>
      <Show when={mode() === "rename"}>
        <text fg={textColor()} flexShrink={0}>
          {copy().renamePrompt}
        </text>
        <input
          id="pokecode-pc-name"
          value={name()}
          onInput={setName}
          focused={!busy()}
          flexShrink={0}
          width="100%"
        />
      </Show>
      <Show when={mode() === "release"}>
        <text
          fg={textColor()}
          flexShrink={0}
        >{`${inspected()?.name ?? ""}: ${copy().releasePrompt}`}</text>
      </Show>
      <Show when={feedback()}>
        <text fg={mutedColor()} flexShrink={0}>
          {feedback()}
        </text>
      </Show>
      <Show
        when={mode() === "browse"}
        fallback={
          <text fg={mutedColor()} flexShrink={0}>
            {copy().editActions}
          </text>
        }
      >
        <box flexDirection="row" flexShrink={0} gap={2}>
          <button
            type="button"
            onMouseUp={(event: MouseEvent) => {
              if (event.button === MouseButton.LEFT) begin("rename")
            }}
          >
            <text fg={mutedColor()}>{`R: ${copy().rename}`}</text>
          </button>
          <button
            type="button"
            onMouseUp={(event: MouseEvent) => {
              if (event.button === MouseButton.LEFT) begin("release")
            }}
          >
            <text fg={mutedColor()}>{`F: ${copy().release}`}</text>
          </button>
        </box>
        <text fg={mutedColor()} flexShrink={0}>
          {copy().navigation}
        </text>
        <text fg={mutedColor()} flexShrink={0}>
          {copy().actions}
        </text>
      </Show>
    </box>
  )
}
