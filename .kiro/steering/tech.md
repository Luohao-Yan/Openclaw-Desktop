# Tech Stack

## Runtime & Framework
- Electron 38 (main process in TypeScript, preload as CJS)
- React 19 + React Router DOM 7 (HashRouter)
- TypeScript 5.9
- Vite 7 (renderer build, dev server on port 5174)

## Styling
- Tailwind CSS 4 (via `@tailwindcss/postcss`)
- CSS custom properties for theming (`--app-bg`, `--app-text`, `--app-border`, etc.)
- No CSS modules — inline styles + Tailwind utility classes

## Key Libraries
- `electron-store` — persistent settings storage in main process
- `lucide-react` — icons
- `@iconify/react` — additional icons
- `react-markdown` + `remark-gfm` — markdown rendering
- `react-resizable-panels` — resizable panel layouts
- `js-yaml` — YAML parsing
- `concurrently` — parallel dev scripts

## IPC Pattern
- All Electron IPC handlers live in `electron/ipc/*.ts`, each exporting a `setup*IPC()` function
- Renderer communicates via `window.electronAPI.*` (typed in `src/types/electron.ts` and `types/electron.ts`)
- IPC handlers return `{ success: boolean, ...data }` or `{ success: false, error: string }`

## Common Commands

```bash
# Development (runs Vite + Electron concurrently)
npm run dev

# Type check only
npm run type-check

# Production build (Vite + tsc + electron-builder)
npm run build

# Package macOS DMG (arm64)
npm run pack:mac:dmg:arm64

# Package macOS DMG (x64)
npm run pack:mac:dmg:x64
```

## Build Outputs
- `dist/` — Vite renderer build
- `dist-electron/` — compiled Electron main/preload (tsc via `tsconfig.node.json`)
