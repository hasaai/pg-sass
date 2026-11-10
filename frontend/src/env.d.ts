/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Maps browser key (Maps JavaScript, Places (New), Geocoding). Optional. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Google Cloud map ID for advanced markers. Optional; DEMO_MAP_ID is used otherwise. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  readonly VITE_API_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
