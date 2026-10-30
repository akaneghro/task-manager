// Pages that render "not found" in-page still answer with the real HTTP status during SSR (like /s/** pages).

/**
 * During SSR waits for `ready` (the page's first data load) and sets the response status to `statusOf()` when it
 * returns one. Does nothing on the client. Await it from `<script setup>`.
 */
export async function useSsrStatus(ready: Promise<unknown>, statusOf: () => number | null | undefined): Promise<void> {
  if (!import.meta.server) return
  // Read the event before awaiting: the Nuxt context is not guaranteed after an await in a plain function.
  const requestEvent = useRequestEvent()
  await ready
  const status = statusOf()
  if (requestEvent && status && status >= 400) setResponseStatus(requestEvent, status)
}
