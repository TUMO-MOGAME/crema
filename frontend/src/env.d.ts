/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Crema API. Public by design — anything behind the `VITE_`
   * prefix is compiled into the browser bundle, so a secret must never go here.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
