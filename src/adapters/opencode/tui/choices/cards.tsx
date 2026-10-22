import { type KeyEvent, MouseButton, type MouseEvent } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createSignal, Match, Show, Switch } from "solid-js"
import type { GameState } from "../../../../application/contracts/game.js"
import {
  decodeEvolutionChoiceProjection,
  decodeMoveChoiceProjection,
  decodeRegionChoiceProjection,
} from "../../../../domain/choices/choices.js"
import { regions } from "../../../../domain/content/catalog.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import { MoveList } from "../components/move-list.js"
import { Sprite } from "../components/sprite.js"
import { fallbackPokecodeTheme, type PokecodeSurface } from "../theme.js"

export function PendingChoiceCard(properties: {
  readonly state: () => GameState
  readonly onResolveMove: (choiceId: string, selectedMoveId: string) => Promise<void>
  readonly onResolveEvolution: (choiceId: string, selectedSpeciesId: string) => Promise<void>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly language: () => GameState["locale"]
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const choice = () => properties.state().pendingChoices[0]
  return (
    <Show when={choice()} keyed>
      {(activeChoice: GameState["pendingChoices"][number]) => (
        <Switch>
          <Match when={activeChoice.kind === "move"}>
            <MoveChoiceCard
              choice={() => activeChoice}
              party={() => properties.state().party}
              choicePokemon={() => properties.state().choicePokemon}
              onResolve={properties.onResolveMove}
              resolveSprite={properties.resolveSprite}
              imageProtocol={properties.imageProtocol}
              language={properties.language}
              theme={properties.theme}
            />
          </Match>
          <Match when={activeChoice.kind === "evolution"}>
            <EvolutionChoiceCard
              choice={() => activeChoice}
              party={() => properties.state().party}
              choicePokemon={() => properties.state().choicePokemon}
              resolveSprite={properties.resolveSprite}
              imageProtocol={properties.imageProtocol}
              language={properties.language}
              onResolve={properties.onResolveEvolution}
              theme={properties.theme}
            />
          </Match>
        </Switch>
      )}
    </Show>
  )
}

export function MoveChoiceCard(properties: {
  readonly choice: () => GameState["pendingChoices"][number] | undefined
  readonly party: () => GameState["party"]
  readonly choicePokemon: () => GameState["choicePokemon"]
  readonly onResolve: (choiceId: string, selectedMoveId: string) => Promise<void>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly language?: (() => GameState["locale"]) | undefined
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const choice = properties.choice()
  if (choice === undefined) return null
  const payload = decodeMoveChoiceProjection(choice.payload)
  if (payload === null) return null
  const pokemon =
    properties.party().find((slot) => slot.pokemon?.id === payload.pokemonId)?.pokemon ??
    properties.choicePokemon().find((instance) => instance.id === payload.pokemonId)
  if (pokemon === undefined || pokemon === null) return null
  const dimensions = useTerminalDimensions()
  const language = () => properties.language?.() ?? "en"
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const moves = [...pokemon.moves, payload.move]
  const copy = () => uiCopy(language())
  return (
    <box
      alignItems="center"
      border
      borderStyle="rounded"
      flexDirection="column"
      gap={1}
      padding={1}
      width="100%"
      minWidth={0}
    >
      <text fg={surface().text} width="100%" wrapMode="word" textAlign="center">
        {copy().movePrompt(pokemon.name)}
      </text>
      <Sprite
        language={properties.language}
        resolve={properties.resolveSprite}
        protocol={properties.imageProtocol}
        theme={surface}
        shiny={pokemon.shiny}
        gender={pokemon.gender}
        speciesId={pokemon.speciesId}
      />
      <text fg={surface().muted} width="100%" wrapMode="word" textAlign="center">
        {copy().moveDescription}
      </text>
      <MoveList
        centered
        leftAlignMoves
        moves={moves}
        language={language()}
        offeredMoveId={payload.move.id}
        height={Math.min(28, Math.max(6, dimensions().height - 19))}
        onActivate={(moveId) => properties.onResolve(choice.id, moveId)}
        theme={properties.theme}
      />
    </box>
  )
}

export function EvolutionChoiceCard(properties: {
  readonly choice: () => GameState["pendingChoices"][number] | undefined
  readonly party: () => GameState["party"]
  readonly choicePokemon: () => GameState["choicePokemon"]
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly language: () => GameState["locale"]
  readonly onResolve: (choiceId: string, selectedSpeciesId: string) => Promise<void>
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const choice = properties.choice()
  if (choice === undefined) return null
  const payload = decodeEvolutionChoiceProjection(choice.payload)
  if (payload === null) return null
  const pokemon =
    properties.party().find((slot) => slot.pokemon?.id === payload.pokemonId)?.pokemon ??
    properties.choicePokemon().find((instance) => instance.id === payload.pokemonId)
  if (pokemon === undefined || pokemon === null) return null
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const [hoveredOption, setHoveredOption] = createSignal<string | null>(null)
  return (
    <box
      alignItems="center"
      border
      borderStyle="rounded"
      flexDirection="column"
      gap={1}
      padding={1}
    >
      <text fg={surface().text}>{uiCopy(properties.language()).evolutionPrompt(pokemon.name)}</text>
      <Sprite
        language={properties.language}
        resolve={properties.resolveSprite}
        protocol={properties.imageProtocol}
        theme={surface}
        shiny={pokemon.shiny}
        gender={pokemon.gender}
        speciesId={pokemon.speciesId}
      />
      <text fg={surface().muted}>{uiCopy(properties.language()).chooseEvolution}</text>
      <box flexDirection="row" flexWrap="wrap" gap={1} justifyContent="center" width="100%">
        {payload.options.map((option) => (
          <EvolutionOptionCard
            option={option}
            pokemon={pokemon}
            hovered={() => hoveredOption() === option.speciesId}
            onHover={() => setHoveredOption(option.speciesId)}
            onLeave={() => setHoveredOption(null)}
            onResolve={() => properties.onResolve(choice.id, option.speciesId)}
            resolveSprite={properties.resolveSprite}
            imageProtocol={properties.imageProtocol}
            language={properties.language}
            theme={surface}
          />
        ))}
      </box>
    </box>
  )
}

function EvolutionOptionCard(properties: {
  readonly option: { readonly speciesId: string; readonly name: string }
  readonly pokemon: { readonly gender: "male" | "female" | "genderless"; readonly shiny: boolean }
  readonly hovered: () => boolean
  readonly onHover: () => void
  readonly onLeave: () => void
  readonly onResolve: () => Promise<void>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly language: () => GameState["locale"]
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  return (
    <button
      alignItems="center"
      backgroundColor={properties.hovered() ? surface().highlight : undefined}
      border={false}
      flexDirection="column"
      flexShrink={0}
      focusable
      width={14}
      padding={1}
      type="button"
      onMouseOver={properties.onHover}
      onMouseOut={properties.onLeave}
      onFocus={properties.onHover}
      onBlur={properties.onLeave}
      onMouseUp={(event: MouseEvent) => {
        if (event.button === MouseButton.LEFT) void properties.onResolve()
      }}
      onKeyDown={(event: KeyEvent) => {
        if (event.name === "return" || event.name === "space") void properties.onResolve()
      }}
    >
      <box flexDirection="row" height={4} justifyContent="center" width="100%">
        <Sprite
          compactFallback
          language={properties.language}
          resolve={properties.resolveSprite}
          protocol={properties.imageProtocol}
          theme={surface}
          shiny={properties.pokemon.shiny}
          gender={properties.pokemon.gender}
          speciesId={properties.option.speciesId}
        />
      </box>
      <box flexDirection="row" justifyContent="center" width="100%">
        <text fg={surface().text}>{properties.option.name}</text>
      </box>
    </button>
  )
}

export function RegionChoiceCard(properties: {
  readonly choice: () => GameState["pendingChoices"][number] | undefined
  readonly visitedRegionIds: () => readonly string[]
  readonly onTravel: (regionId: string) => Promise<void>
  readonly language?: (() => GameState["locale"]) | undefined
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const choice = properties.choice()
  if (choice === undefined) return null
  const payload = decodeRegionChoiceProjection(choice.payload)
  if (payload === null) return null
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const [hoveredRegion, setHoveredRegion] = createSignal<string | null>(null)
  const availableRegions = () => regions(properties.language?.() ?? "en")
  const completedRegionName = () =>
    availableRegions().find((region) => region.id === payload.region)?.name ?? payload.region
  return (
    <box
      alignItems="center"
      border
      borderStyle="rounded"
      flexDirection="column"
      gap={1}
      padding={1}
    >
      <text fg={surface().text}>
        {uiCopy(properties.language?.() ?? "en").regionComplete(completedRegionName())}
      </text>
      <text fg={surface().muted}>{uiCopy(properties.language?.() ?? "en").chooseNextRegion}</text>
      <box flexDirection="row" flexWrap="wrap" gap={1} justifyContent="center" width="100%">
        {availableRegions()
          .filter(
            (region) =>
              region.id !== payload.region && !properties.visitedRegionIds().includes(region.id),
          )
          .map((region) => (
            <button
              alignItems="center"
              backgroundColor={hoveredRegion() === region.id ? surface().highlight : undefined}
              border={false}
              flexShrink={0}
              focusable
              justifyContent="center"
              padding={1}
              type="button"
              width={14}
              onMouseOver={() => setHoveredRegion(region.id)}
              onMouseOut={() => setHoveredRegion(null)}
              onFocus={() => setHoveredRegion(region.id)}
              onBlur={() => setHoveredRegion(null)}
              onMouseUp={(event: MouseEvent) => {
                if (event.button === MouseButton.LEFT) void properties.onTravel(region.id)
              }}
              onKeyDown={(event: KeyEvent) => {
                if (event.name === "return" || event.name === "space") {
                  void properties.onTravel(region.id)
                }
              }}
            >
              <text fg={surface().text}>{region.name}</text>
            </button>
          ))}
      </box>
    </box>
  )
}
