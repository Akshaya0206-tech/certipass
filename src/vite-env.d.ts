/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the CertiPass Worker (accounts and certificate storage), e.g. https://certipass.example.workers.dev. Unset = offline prototype mode. */
  readonly VITE_CERT_API_URL?: string
  /** Link to the certificate folder in Google Drive, for the admin "Open Google Drive Folder" button. */
  readonly VITE_DRIVE_FOLDER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
