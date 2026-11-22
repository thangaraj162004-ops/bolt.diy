# CLAUDE.md

Rules for anyone (human or AI) working on this fork of bolt.diy.

## How the preview works

- There is one preview engine: previews are built in the browser with
  `esbuild-wasm` (the shim in `app/lib/webcontainer/shim/`) and shown in an
  `<iframe>` with a sandbox that allows scripts but never `allow-same-origin`.
- `@webcontainer/api` (StackBlitz WebContainers) has been removed. Do not add it
  back, and do not add another engine switch: there is no engine variable.
- The rest of the app talks to the small interface in
  `app/lib/webcontainer/types.ts`, not to the shim directly, so a second engine
  could be added later. The folder name `webcontainer` is historical.
- There is one build prompt, `app/lib/common/prompts/esbuild-preview.ts`.

## Security

- Never put secret keys in the code, in anything sent to the browser, or in logs.

## Pages and headers

- Keep payments and login on normal pages.
- The app must never send cross-origin isolation headers
  (`Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy`); the preview
  does not need them.

## Way of working

- Make small changes.
- Finish every task by listing the files that were changed.

## Deployment

- The Cloudflare production branch for this test deploy is `esbuild-shim-1`.
- No build variable is needed for the preview. An old `VITE_PREVIEW_ENGINE`
  value is ignored and can be deleted.
- `VITE_*` variables are read at build time, not at runtime, so set them as
  Cloudflare **build** variables; a runtime variable has no effect.
- Never set any `VITE_*_TOKEN` variables on a public deploy. Every `VITE_*`
  value is copied into the public JavaScript that anyone can read.
- Never commit secrets.
- The `/preview-demo` page and its `VITE_PREVIEW_DEMO` flag are for testing
  only. Before any public launch, remove the page or keep the flag off (unset
  or not `1`); with it off the route returns 404.
