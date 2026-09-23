/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Garden API Worker. Defaults to same-origin when unset. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
