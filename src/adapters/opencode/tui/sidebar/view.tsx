import { type KeyEvent, MouseButton, type MouseEvent } from "@opentui/core"
import type { Accessor } from "solid-js"
import { createSignal, Match, Show, Switch } from "solid-js"
import type { GameState } from "../../../../application/contracts/game.js"
import { decodeStarterChoiceProjection } from "../../../../domain/choices/choices.js"
import { regions, startersForRegion } from "../../../../domain/content/catalog.js"
import type { PendingEncounter } from "../../../../domain/encounters/encounter.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import { PendingChoiceCard, RegionChoiceCard } from "../choices/cards.js"
import { EncounterCard } from "../choices/encounter.js"
import { PokecodeActionButton } from "../components/action-button.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import { Sprite } from "../components/sprite.js"

type SidebarViewKind = "starter" | "move" | "evolution" | "region" | "encounter" | "team"

export function sidebarViewFor(state: GameState): SidebarViewKind {
  if (state.phase === "onboarding") return "starter"
  const pendingChoice = state.pendingChoices[0]
  if (pendingChoice?.kind === "starter") return "starter"
  if (pendingChoice?.kind === "move") return "move"
  if (pendingChoice?.kind === "evolution") return "evolution"
  if (pendingChoice?.kind === "region") return "region"
  if (state.pendingEncounter !== null) return "encounter"
  return "team"
}

export function SidebarView(properties: {
  readonly hoveredEncounterAction: () => "catch" | "run" | null
  readonly hoveredStarter: () => string | null
  readonly hoverStarter: (speciesId: string | null) => void
  readonly mutedColor: () => string
  readonly onChooseStarter: (regionId: string, speciesId: string) => Promise<void>
  readonly onTravelRegion: (regionId: string) => Promise<void>
  readonly onTravelLocation: (locationId: string) => Promise<void>
  readonly onResolveEncounter: (
    encounterId: string,
    encounter: PendingEncounter,
    capture: boolean,
  ) => Promise<void>
  readonly onResolveEvolution: (choiceId: string, selectedSpeciesId: string) => Promise<void>
  readonly onResolveMove: (choiceId: string, selectedMoveId: string) => Promise<void>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly setHoveredEncounterAction: (action: "catch" | "run" | null) => void
  readonly starterHoverBackground: string | Accessor<string>
  readonly state: () => GameState
}) {
  const view = () => sidebarViewFor(properties.state())
  const decisionCount = () =>
    properties.state().pendingChoices.filter((choice) => choice.kind !== "catch").length
  const encounterCount = () => properties.state().pendingEncounterCount
  return (
    <box flexDirection="column" gap={1}>
      <Show when={decisionCount() + encounterCount() > 0}>
        <text>
          {uiCopy(properties.state().locale).queueCounts(decisionCount(), encounterCount())}
        </text>
      </Show>
      <Switch>
        <Match when={view() === "starter"}>
          <StarterButtons
            hovered={properties.hoveredStarter}
            hoverBackground={properties.starterHoverBackground}
            language={() => properties.state().locale}
            regionId={() => {
              const choice = properties.state().pendingChoices[0]
              return choice?.kind === "starter"
                ? decodeStarterChoiceProjection(choice.payload)?.region
                : undefined
            }}
            onChoose={properties.onChooseStarter}
            onHover={properties.hoverStarter}
            resolveSprite={properties.resolveSprite}
            imageProtocol={properties.imageProtocol}
          />
        </Match>
        <Match when={view() === "move" || view() === "evolution"}>
          <PendingChoiceCard
            state={properties.state}
            onResolveEvolution={properties.onResolveEvolution}
            onResolveMove={properties.onResolveMove}
            resolveSprite={properties.resolveSprite}
            imageProtocol={properties.imageProtocol}
            language={() => properties.state().locale}
          />
        </Match>
        <Match when={view() === "region"}>
          <RegionChoiceCard
            choice={() => properties.state().pendingChoices[0]}
            language={() => properties.state().locale}
            visitedRegionIds={() =>
              properties
                .state()
                .exploration?.regions.filter((region) => region.visited)
                .map((region) => region.id) ?? []
            }
            onTravel={properties.onTravelRegion}
          />
        </Match>
        <Match when={view() === "encounter"}>
          <Show when={properties.state().pendingEncounter} keyed>
            {(encounter: NonNullable<GameState["pendingEncounter"]>) => (
              <EncounterCard
                encounter={() => encounter}
                mutedColor={properties.mutedColor}
                hoveredAction={properties.hoveredEncounterAction}
                onHover={properties.setHoveredEncounterAction}
                onResolve={properties.onResolveEncounter}
                resolveSprite={properties.resolveSprite}
                imageProtocol={properties.imageProtocol}
                language={() => properties.state().locale}
              />
            )}
          </Show>
        </Match>
        <Match when={view() === "team"}>
          <LocationProgress state={properties.state} onTravel={properties.onTravelLocation} />
          <PartyGrid
            language={() => properties.state().locale}
            party={() => properties.state().party}
            resolveSprite={properties.resolveSprite}
            imageProtocol={properties.imageProtocol}
          />
        </Match>
      </Switch>
    </box>
  )
}

type StarterButtonsProperties = {
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly regionId?: () => string | undefined
  readonly hovered: () => string | null
  readonly hoverBackground: string | Accessor<string>
  readonly language?: (() => GameState["locale"]) | undefined
  readonly onChoose: (regionId: string, speciesId: string) => Promise<void>
  readonly onHover: (speciesId: string | null) => void
}

export function StarterButtons(properties: StarterButtonsProperties) {
  return (
    <box flexDirection="column" gap={1}>
      <text>{uiCopy(properties.language?.() ?? "en").chooseStarter}</text>
      {regions(properties.language?.() ?? "en")
        .filter(
          (region) => properties.regionId?.() === undefined || region.id === properties.regionId(),
        )
        .map((region) => (
          <StarterRegionCard {...properties} region={region} />
        ))}
    </box>
  )
}

function StarterRegionCard(
  properties: StarterButtonsProperties & {
    readonly region: { readonly id: string; readonly name: string }
  },
) {
  const [rowWidth, setRowWidth] = createSignal(0)
  // Odd-width cells and sprites share a single center column. Use spare space for
  // gaps and outer margins instead of changing the middle cell's width or position.
  const cellWidth = () => {
    const width = Math.max(1, Math.floor((rowWidth() - 2) / 3))
    return width % 2 === 0 ? width - 1 : width
  }
  const columnGap = () => Math.min(3, Math.max(1, Math.floor((rowWidth() - cellWidth() * 3) / 2)))
  // Text floors half-column offsets; flex centering rounds them up for boxes.
  const gridInset = () =>
    Math.max(0, Math.floor((rowWidth() - (cellWidth() * 3 + columnGap() * 2)) / 2))
  const hoverBackground = () =>
    typeof properties.hoverBackground === "function"
      ? properties.hoverBackground()
      : properties.hoverBackground
  const starters = () => startersForRegion(properties.region.id, properties.language?.() ?? "en")
  return (
    <box
      alignItems="center"
      border
      borderStyle="rounded"
      flexDirection="column"
      flexShrink={0}
      gap={1}
      padding={1}
    >
      <text>{properties.region.name}</text>
      <box
        flexDirection="row"
        width="100%"
        onSizeChange={function () {
          setRowWidth(this.width)
        }}
      >
        <box flexDirection="row" flexShrink={0} gap={columnGap()} marginLeft={gridInset()}>
          {starters().map((starter) => (
            <button
              alignItems="center"
              backgroundColor={
                properties.hovered() === starter.speciesId ? hoverBackground() : undefined
              }
              border={false}
              flexDirection="column"
              flexShrink={0}
              width={cellWidth()}
              focusable
              paddingTop={1}
              paddingBottom={1}
              type="button"
              onMouseUp={(event: MouseEvent) => {
                if (event.button !== MouseButton.LEFT) return
                void properties.onChoose(properties.region.id, starter.speciesId)
              }}
              onMouseOver={() => properties.onHover(starter.speciesId)}
              onMouseOut={() => properties.onHover(null)}
              onKeyDown={(event: KeyEvent) => {
                if (event.name !== "return" && event.name !== "space") return
                void properties.onChoose(properties.region.id, starter.speciesId)
              }}
              onFocus={() => properties.onHover(starter.speciesId)}
              onBlur={() => properties.onHover(null)}
            >
              <box
                position="absolute"
                left={-1}
                top={0}
                bottom={0}
                width={cellWidth() + 2}
                backgroundColor={
                  properties.hovered() === starter.speciesId ? hoverBackground() : "transparent"
                }
                zIndex={0}
              />
              <box height={4} zIndex={1}>
                <Sprite
                  compactFallback
                  width={9}
                  language={properties.language}
                  resolve={properties.resolveSprite}
                  protocol={properties.imageProtocol}
                  shiny={false}
                  gender="male"
                  speciesId={starter.speciesId}
                />
              </box>
            </button>
          ))}
        </box>
      </box>
    </box>
  )
}

export function LocationProgress(properties: {
  readonly state: () => GameState
  readonly onTravel: (locationId: string) => Promise<void>
}) {
  const state = properties.state
  const [hoveredTravel, setHoveredTravel] = createSignal(false)
  const currentLocation = () =>
    state().exploration?.locations.find((location) => location.id === state().location)?.name ??
    uiCopy(state().locale).unknown
  const currentRegion = () =>
    regions(state().locale).find((region) => region.id === state().region)?.name ??
    uiCopy(state().locale).unknown
  const latestUnlockedLocation = () => {
    const locations = state().exploration?.locations ?? []
    return locations.findLast((location) => location.unlocked)
  }
  const travelTarget = () => {
    const latestUnlocked = latestUnlockedLocation()
    return latestUnlocked?.id === state().location ? null : (latestUnlocked ?? null)
  }
  const travelToUnlockedLocation = (): Promise<void> => {
    const target = travelTarget()
    return target === null ? Promise.resolve() : properties.onTravel(target.id)
  }
  const percentage = () => {
    const progress = state().exploration?.locationUnlockProgress ?? 0
    const threshold = state().exploration?.locationUnlockThreshold ?? 0
    return threshold === 0 ? 0 : Math.min((progress / threshold) * 100, 100)
  }
  return (
    <box flexDirection="column">
      <text>{`${uiCopy(state().locale).location}: ${currentLocation()} (${currentRegion()})`}</text>
      <box flexDirection="row" width="100%">
        <text>{`${uiCopy(state().locale).nextLocation}: `}</text>
        {travelTarget() === null ? (
          <text>{`${percentage().toFixed(2)}%`}</text>
        ) : (
          <PokecodeActionButton
            hovered={hoveredTravel}
            label={uiCopy(state().locale).travel}
            onActivate={travelToUnlockedLocation}
            onHover={() => setHoveredTravel(true)}
            onLeave={() => setHoveredTravel(false)}
            tone="success"
          />
        )}
      </box>
    </box>
  )
}

export function PartyGrid(properties: {
  readonly language?: (() => GameState["locale"]) | undefined
  readonly party: () => GameState["party"]
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
}) {
  const occupiedSlots = () => properties.party().filter((slot) => slot.pokemon !== null)
  return (
    <box flexDirection="column" gap={1}>
      <PartyRow
        language={properties.language}
        resolveSprite={properties.resolveSprite}
        imageProtocol={properties.imageProtocol}
        slots={() => occupiedSlots().slice(0, 2)}
      />
      <PartyRow
        language={properties.language}
        resolveSprite={properties.resolveSprite}
        imageProtocol={properties.imageProtocol}
        slots={() => occupiedSlots().slice(2, 4)}
      />
      <PartyRow
        language={properties.language}
        resolveSprite={properties.resolveSprite}
        imageProtocol={properties.imageProtocol}
        slots={() => occupiedSlots().slice(4, 6)}
      />
    </box>
  )
}

function PartyRow(properties: {
  readonly language?: (() => GameState["locale"]) | undefined
  readonly slots: () => GameState["party"]
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
}) {
  return (
    <box flexDirection="row" gap={1}>
      {properties.slots().map((slot) => (
        <box alignItems="center" flexDirection="column" height={6} width={18}>
          {slot.pokemon === null ? null : (
            <>
              <Sprite
                language={properties.language}
                resolve={properties.resolveSprite}
                protocol={properties.imageProtocol}
                shiny={slot.pokemon.shiny}
                gender={slot.pokemon.gender}
                speciesId={slot.pokemon.speciesId}
              />
              <text>
                {`${slot.pokemon.name} ${slot.pokemon.gender === "male" ? "♂" : slot.pokemon.gender === "female" ? "♀" : "—"}`}
              </text>
              <text>{`Lv.${slot.pokemon.level}`}</text>
            </>
          )}
        </box>
      ))}
    </box>
  )
}
