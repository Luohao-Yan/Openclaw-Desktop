# Project Structure

```
electron/               # Electron main process
  main.ts               # App entry, window creation, IPC registration
  preload.ts / .cjs     # Context bridge (exposes window.electronAPI)
  ipc/                  # One file per domain, each exports setup*IPC()
  config/               # Manifest configs (e.g. openclaw-manifests/)

src/                    # React renderer
  App.tsx               # Root: providers, routing, setup vs main layout
  main.tsx              # ReactDOM entry
  index.css             # Global styles + CSS custom property theme vars
  global.d.ts           # Global type augmentations

  components/           # Shared UI components (Sidebar, TitleBar, etc.)
    setup/              # Setup flow step components
  contexts/             # React contexts (DesktopRuntime, SetupFlow, Theme)
  i18n/                 # I18nContext + translations.ts
  pages/                # One file per route/page
    setup/              # Setup wizard pages
    settings/           # Settings sub-pages
  services/             # Non-IPC business logic (e.g. gatewayRepair.ts)
  types/                # Shared TypeScript types
  config/               # Frontend config (e.g. cron manifest)

types/                  # Shared types used by both main and renderer
resources/              # App icons (png, svg, ico, icns)
public/                 # Static assets served by Vite
design/                 # Design specs and UI documentation (not shipped)
docs/                   # Architecture and product docs (not shipped)
dist/                   # Vite renderer build output (gitignored)
dist-electron/          # tsc main process build output (gitignored)
release-artifacts/      # electron-builder packaged outputs (gitignored)
```

## Conventions

- Pages map 1:1 to routes defined in `App.tsx`
- New IPC domains: add a file in `electron/ipc/`, export `setup*IPC()`, register it in `electron/main.ts`
- New renderer API calls: extend the type in `src/types/electron.ts` and `types/electron.ts`, and expose via `electron/preload.ts`
- Theme values always use CSS custom properties, never hardcoded colors
- i18n strings go in `src/i18n/translations.ts`; use the `useI18n()` hook in components
