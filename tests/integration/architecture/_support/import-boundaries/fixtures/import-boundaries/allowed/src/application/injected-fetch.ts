export const loadWithInjectedFetch = (
  fetch: (url: string) => Promise<string>,
  url: string,
): Promise<string> => fetch(url)

export const fetch = (input: string): string => input
export const pureHelper = (): string => fetch("pure-value")
