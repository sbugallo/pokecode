import { describe, expect } from "bun:test"
import "../../../src/adapters/opencode/tui/controls/native.js"
import { LocationTravelDialog } from "../../../src/adapters/opencode/tui/travel/dialog.js"
import { renderTui, testTui } from "../../support/tui.js"

describe("location travel dialog", () => {
  testTui("groups visited regions and travels to the selected region's location", async () => {
    const traveled: string[] = []
    const rendered = await renderTui(
      () => (
        <LocationTravelDialog
          currentLocationId="pallet-town"
          language="es"
          regions={[
            { id: "kanto", name: "Kanto" },
            { id: "unova", name: "Teselia" },
          ]}
          locations={[
            {
              id: "pallet-town",
              name: "Pueblo Paleta",
              regionId: "kanto",
              unlocked: true,
              encounterless: true,
            },
            {
              id: "nuvema-town",
              name: "Pueblo Arcilla",
              regionId: "unova",
              unlocked: true,
              encounterless: true,
            },
          ]}
          pokemonByLocation={{}}
          onClose={() => {}}
          onTravel={async (locationId) => {
            traveled.push(locationId)
          }}
          resolveSprite={async () => ({ kind: "placeholder" })}
          imageProtocol={() => "auto"}
        />
      ),
      { width: 100, height: 30 },
    )
    await rendered.flush()
    const lines = rendered.captureCharFrame().split("\n")
    expect(lines.findIndex((line) => line.includes("Kanto"))).toBeLessThan(
      lines.findLastIndex((line) => line.includes("Pueblo Paleta")),
    )
    expect(lines.findIndex((line) => line.includes("Teselia"))).toBeLessThan(
      lines.findIndex((line) => line.includes("Pueblo Arcilla")),
    )
    const row = lines.findIndex((line) => line.includes("Pueblo Arcilla"))
    await rendered.mockMouse.click(lines[row]?.indexOf("Pueblo Arcilla") ?? -1, row)
    rendered.mockInput.pressEnter()
    await rendered.flush()
    expect(traveled).toEqual(["nuvema-town"])
  })

  testTui(
    "localizes locations, hides unknown species, and changes the preview on selection",
    async () => {
      // GIVEN
      const requestedSprites: string[] = []
      const rendered = await renderTui(
        () => (
          <LocationTravelDialog
            currentLocationId="pallet-town"
            language="es"
            locations={[
              { id: "pallet-town", name: "Pueblo Paleta", unlocked: true, encounterless: false },
              { id: "kanto-route-1", name: "Ruta 1", unlocked: true, encounterless: false },
            ]}
            onClose={() => {}}
            onTravel={async () => {}}
            pokemonByLocation={{
              "pallet-town": [
                { speciesId: "bulbasaur", name: "Bulbasaur", status: "caught" },
                { speciesId: "rattata", name: "Rattata", status: "unknown" },
                { speciesId: "pikachu", name: "Pikachu", status: "seen" },
                { speciesId: "meowth", name: "Meowth", status: "unknown" },
              ],
              "kanto-route-1": [{ speciesId: "goldeen", name: "Goldeen", status: "caught" }],
            }}
            resolveSprite={async (speciesId) => {
              requestedSprites.push(speciesId)
              return { kind: "placeholder" }
            }}
            imageProtocol={() => "auto"}
          />
        ),
        { width: 100, height: 30 },
      )

      // WHEN
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      const rows = frame.split("\n")
      const routeRow = rows.findIndex((line) => line.includes("Ruta 1"))
      const routeColumn = rows[routeRow]?.indexOf("Ruta 1") ?? -1
      await rendered.mockMouse.click(routeColumn, routeRow)
      await rendered.flush()

      // THEN
      expect(frame).toContain("Pueblo Paleta")
      expect(frame).toContain("Bulbasaur")
      expect(frame).toContain("Pikachu")
      expect(frame).toContain("???")
      expect(frame).not.toContain("Rattata")
      expect(frame).not.toContain("Meowth")
      expect(rendered.captureCharFrame()).toContain("Goldeen")
      expect(rendered.captureCharFrame()).not.toContain("Bulbasaur")
      expect(requestedSprites).toContain("bulbasaur")
      expect(requestedSprites).toContain("pikachu")
      expect(requestedSprites).toContain("goldeen")
      expect(requestedSprites.filter((speciesId) => speciesId === "0")).toHaveLength(2)
    },
  )
})
