/**
 * Ambient declarations for Vite `?raw` imports.
 *
 * `wrangler.jsonc` is a JSONC file (it carries `//` comments), so it cannot be
 * loaded with `resolveJsonModule`/`with { type: "json" }` — both go through
 * strict `JSON.parse`. `?raw` gives the file text verbatim, which the config
 * guard test then parses as JSONC.
 *
 * `apps/api` has no Vite dependency (it is a Worker package, and the Workers
 * vitest pool cannot touch the filesystem), so `vite/client`'s own `*?raw`
 * declaration is not in scope here.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
