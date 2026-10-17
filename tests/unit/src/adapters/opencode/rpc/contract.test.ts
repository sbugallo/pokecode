import { describe, expect, test } from "bun:test"
import { PokecodeRpc as adapterContract } from "../../../../../../src/adapters/opencode/rpc/contract.js"

function sortedFields(fields: readonly string[]): string[] {
  return [...fields].sort()
}

describe("OpenCode RPC compatibility contract", () => {
  test("retains the public RPC ID, complete method inventory, and event inventory", () => {
    // GIVEN
    // WHEN
    const methodNames = Object.keys(adapterContract.methods).sort()
    const eventNames = Object.keys(adapterContract.events).sort()

    // THEN
    expect(adapterContract.id).toBe("pokecode")
    expect(methodNames).toEqual(
      [
        "catchEncounter",
        "chooseStarter",
        "dismissNextRegionChoice",
        "exportTeam",
        "reopenNextRegionChoice",
        "resolveEvolutionChoice",
        "resolveMoveChoice",
        "replaceParty",
        "renamePokemon",
        "releasePokemon",
        "runEncounter",
        "sprite",
        "status",
        "travelTo",
        "travelToRegion",
        "collection",
        "dex",
      ].sort(),
    )
    expect(eventNames).toEqual(["statusChanged"])
  })

  test("retains input schemas, result variants, and required output fields", () => {
    // GIVEN
    const methods = adapterContract.methods

    // WHEN
    const emptyInputMethods = [
      methods.status,
      methods.collection,
      methods.dex,
      methods.exportTeam,
      methods.dismissNextRegionChoice,
      methods.reopenNextRegionChoice,
    ]

    // THEN
    for (const method of emptyInputMethods) {
      expect(method.input).toEqual({ type: "object", properties: {}, additionalProperties: false })
    }
    for (const method of [methods.catchEncounter, methods.runEncounter]) {
      expect(method.input).toMatchObject({
        properties: { encounterId: { type: "string", format: "uuid" } },
        required: ["encounterId"],
        additionalProperties: false,
      })
    }
    expect(methods.status.output).toEqual(methods.dismissNextRegionChoice.output)
    expect(methods.status.output).toEqual(methods.reopenNextRegionChoice.output)
    expect(methods.status.output).toEqual(adapterContract.events.statusChanged.schema)
    expect(methods.catchEncounter.output).toEqual(methods.runEncounter.output)
    expect(methods.dex.output.safeParse({ pokemon: [], discoveries: [] }).success).toBe(true)
    expect(methods.dex.output.safeParse({ pokemon: [] }).success).toBe(false)
    expect(methods.resolveMoveChoice.output).toEqual(methods.resolveEvolutionChoice.output)
    expect(methods.chooseStarter.input).toMatchObject({
      additionalProperties: false,
      properties: {
        regionId: { type: "string", minLength: 1 },
        speciesId: { type: "string", minLength: 1 },
      },
    })
    expect(sortedFields(methods.chooseStarter.input.required)).toEqual(
      sortedFields(["regionId", "speciesId"]),
    )
    expect(methods.replaceParty.input.properties.pokemonIds.items).toEqual({ type: "string" })
    expect(methods.resolveMoveChoice.input.properties.choiceId).toEqual({ type: "string" })
    expect(sortedFields(methods.chooseStarter.output.properties.kind.enum)).toEqual(
      sortedFields(["selected", "invalid-region", "invalid-starter", "already-selected"]),
    )
    expect(sortedFields(methods.travelToRegion.output.properties.kind.enum)).toEqual(
      sortedFields([
        "traveled",
        "inactive",
        "invalid-region",
        "already-visited",
        "region-incomplete",
      ]),
    )
    expect(sortedFields(methods.catchEncounter.output.properties.kind.enum)).toEqual(
      sortedFields(["caught", "ran", "inactive", "no-encounter"]),
    )
    expect(sortedFields(methods.resolveMoveChoice.output.properties.kind.enum)).toEqual(
      sortedFields(["resolved", "inactive", "invalid-choice"]),
    )
    expect(sortedFields(methods.chooseStarter.output.required)).toEqual(
      sortedFields(["kind", "state"]),
    )
    expect(sortedFields(methods.collection.output.required)).toEqual(sortedFields(["pokemon"]))
    expect(sortedFields(methods.exportTeam.output.required)).toEqual(sortedFields(["kind", "text"]))
    expect(sortedFields(methods.sprite.output.required)).toEqual(sortedFields(["kind"]))
    expect(sortedFields(methods.status.output.required)).toEqual(
      sortedFields([
        "phase",
        "locale",
        "message",
        "region",
        "location",
        "party",
        "pendingChoices",
        "pendingEncounter",
        "pendingEncounterCount",
        "choicePokemon",
        "exploration",
      ]),
    )
  })
})
