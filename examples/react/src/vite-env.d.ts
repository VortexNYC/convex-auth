/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_PASSKEY_RP_ID?: string;
  readonly VITE_PASSKEY_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
