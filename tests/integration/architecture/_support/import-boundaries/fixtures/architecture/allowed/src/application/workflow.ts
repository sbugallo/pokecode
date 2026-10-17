import { core } from "../domain/core.js"

export const workflow = core
export const useInjectedFetch = (fetch: (url: string) => string, url: string): string => fetch(url)
export const fetch = (value: string): string => value
export const pureFetchNamedFunction = (): string => fetch("pure")
