import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { createSignal, For, Show } from "solid-js"
import type { Language } from "../../../../domain/shared/language.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import { bold, PokecodeActionButton } from "../components/action-button.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import { Sprite } from "../components/sprite.js"
import { fallbackPokecodeTheme, type PokecodeTheme } from "../theme.js"

type TravelLocation = {
  readonly id: string
  readonly name: string
  readonly unlocked: boolean
  readonly encounterless: boolean
  readonly regionId?: string | undefined
}

type LocationPokemonPreview = {
  readonly speciesId: string
  readonly name: string
  readonly status: "caught" | "seen" | "unknown"
}

export function LocationTravelDialog(properties: {
  readonly currentLocationId: string
  readonly language: Language
  readonly locations: readonly TravelLocation[]
  readonly regions?: readonly { readonly id: string; readonly name: string }[] | undefined
  readonly onClose: () => void
  readonly onTravel: (locationId: string) => Promise<void>
  readonly pokemonByLocation: Readonly<Record<string, readonly LocationPokemonPreview[]>>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly theme?: (() => PokecodeTheme) | undefined
}) {
  const surface = () => properties.theme?.().dialog ?? fallbackPokecodeTheme.dialog
  const copy = () => uiCopy(properties.language)
  const initialLocationId = properties.locations.some(
    (location) => location.id === properties.currentLocationId,
  )
    ? properties.currentLocationId
    : (properties.locations[0]?.id ?? "")
  const [selectedLocationId, setSelectedLocationId] = createSignal(initialLocationId)
  let locationsScrollbox: ScrollBoxRenderable | undefined
  let pokemonScrollbox: ScrollBoxRenderable | undefined
  const selectedLocation = () =>
    properties.locations.find((location) => location.id === selectedLocationId())
  const locationGroups = () =>
    properties.regions?.length
      ? properties.regions
          .map((region) => ({
            ...region,
            locations: properties.locations.filter((location) => location.regionId === region.id),
          }))
          .filter((region) => region.locations.length > 0)
      : [{ id: "", name: "", locations: properties.locations }]
  const pokemonRows = () => {
    const pokemon = properties.pokemonByLocation[selectedLocationId()] ?? []
    const rows: LocationPokemonPreview[][] = []
    for (let index = 0; index < pokemon.length; index += 3) {
      rows.push(pokemon.slice(index, index + 3))
    }
    return rows
  }
  const selectLocation = (locationId: string): void => {
    setSelectedLocationId(locationId)
    pokemonScrollbox?.scrollTo(0)
    locationsScrollbox?.scrollChildIntoView(`travel-location-${locationId}`)
  }
  const travel = (): void => {
    const location = selectedLocation()
    if (location !== undefined) void properties.onTravel(location.id)
  }

  useKeyboard((event: KeyEvent) => {
    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      properties.onClose()
      return
    }
    if (event.name === "return") {
      event.preventDefault()
      event.stopPropagation()
      travel()
      return
    }
    if (event.name === "pageup" || event.name === "pagedown") {
      event.preventDefault()
      event.stopPropagation()
      pokemonScrollbox?.scrollBy(event.name === "pageup" ? -1 : 1, "viewport")
      return
    }
    if (event.name !== "up" && event.name !== "down") return
    event.preventDefault()
    event.stopPropagation()
    const selectedIndex = properties.locations.findIndex(
      (location) => location.id === selectedLocationId(),
    )
    const offset = event.name === "up" ? -1 : 1
    const nextLocation =
      properties.locations[
        Math.max(0, Math.min(properties.locations.length - 1, selectedIndex + offset))
      ]
    if (nextLocation !== undefined) selectLocation(nextLocation.id)
  })

  return (
    <box
      backgroundColor={surface().background}
      border
      borderColor={surface().border}
      borderStyle="rounded"
      flexDirection="column"
      gap={1}
      padding={1}
      shouldFill
      width="100%"
      height="100%"
    >
      <text attributes={bold} fg={surface().accent}>
        {copy().locationsDialog}
      </text>
      <box
        backgroundColor={surface().background}
        flexDirection="row"
        flexGrow={1}
        gap={1}
        minHeight={0}
        width="100%"
      >
        <scrollbox
          backgroundColor={surface().background}
          contentOptions={{ flexDirection: "column" }}
          flexShrink={0}
          height="100%"
          ref={(renderable) => {
            locationsScrollbox = renderable
          }}
          shouldFill
          scrollY
          verticalScrollbarOptions={{ width: 1 }}
          width="30%"
        >
          <For each={locationGroups()}>
            {(region) => (
              <box flexDirection="column" flexShrink={0}>
                <Show when={region.name}>
                  <text attributes={bold} fg={surface().accent}>
                    {region.name}
                  </text>
                </Show>
                <For each={region.locations}>
                  {(location) => (
                    <button
                      id={`travel-location-${location.id}`}
                      focusable
                      paddingLeft={1}
                      paddingRight={1}
                      type="button"
                      onMouseUp={() => selectLocation(location.id)}
                    >
                      <text
                        fg={
                          selectedLocationId() === location.id ? surface().accent : surface().text
                        }
                      >
                        {`${selectedLocationId() === location.id ? "› " : "  "}${location.name}`}
                      </text>
                    </button>
                  )}
                </For>
              </box>
            )}
          </For>
        </scrollbox>
        <box
          backgroundColor={surface().background}
          flexDirection="column"
          flexGrow={1}
          minWidth={0}
          minHeight={0}
          shouldFill
        >
          <text attributes={bold} fg={surface().accent}>
            {selectedLocation()?.name ?? copy().unknown}
          </text>
          <scrollbox
            backgroundColor={surface().background}
            contentOptions={{ flexDirection: "column" }}
            flexGrow={1}
            flexShrink={1}
            minHeight={0}
            ref={(renderable) => {
              pokemonScrollbox = renderable
            }}
            shouldFill
            scrollY
            verticalScrollbarOptions={{ width: 1 }}
            width="100%"
          >
            <Show
              when={pokemonRows().length > 0}
              fallback={<text fg={surface().muted}>{copy().noLocationPokemon}</text>}
            >
              <For each={pokemonRows()}>
                {(row) => (
                  <box flexDirection="row" flexShrink={0} width="100%">
                    <For each={row}>
                      {(pokemon) => (
                        <box
                          alignItems="center"
                          backgroundColor={surface().background}
                          flexBasis={0}
                          flexDirection="column"
                          flexGrow={1}
                          gap={1}
                          height={8}
                          justifyContent="center"
                          minWidth={0}
                          shouldFill
                        >
                          <box alignItems="center" height={4} justifyContent="center" width="100%">
                            <Sprite
                              compactFallback
                              height={3}
                              language={() => properties.language}
                              resolve={properties.resolveSprite}
                              protocol={properties.imageProtocol}
                              theme={surface}
                              shiny={false}
                              gender="genderless"
                              speciesId={pokemon.status === "unknown" ? "0" : pokemon.speciesId}
                              width={6}
                            />
                          </box>
                          <box
                            alignItems="center"
                            flexDirection="row"
                            height={3}
                            justifyContent="center"
                            width="100%"
                          >
                            <text
                              fg={
                                pokemon.status === "caught"
                                  ? surface().success
                                  : pokemon.status === "seen"
                                    ? surface().muted
                                    : surface().text
                              }
                            >
                              {pokemon.status === "unknown" ? "  " : "● "}
                            </text>
                            <text
                              fg={pokemon.status === "unknown" ? surface().muted : surface().text}
                            >
                              {pokemon.status === "unknown" ? "???" : pokemon.name}
                            </text>
                          </box>
                        </box>
                      )}
                    </For>
                  </box>
                )}
              </For>
            </Show>
          </scrollbox>
        </box>
      </box>
      <box flexDirection="row" gap={1} justifyContent="center">
        <PokecodeActionButton
          hovered={() => false}
          label={copy().dismiss}
          onActivate={async () => properties.onClose()}
          onHover={() => {}}
          onLeave={() => {}}
          theme={surface}
          tone="secondary"
        />
        <PokecodeActionButton
          hovered={() => false}
          label={copy().travel}
          onActivate={async () => travel()}
          onHover={() => {}}
          onLeave={() => {}}
          theme={surface}
          tone="success"
        />
      </box>
    </box>
  )
}
