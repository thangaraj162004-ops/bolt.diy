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

- The Cloudflare Worker is named `codeapp-ai` (`name` in `wrangler.jsonc`, which
  also matches `name` in `package.json`).
- The Cloudflare production branch for this test deploy is `esbuild-shim-1`.
- The custom domain is attached in the Cloudflare dashboard, not in
  `wrangler.jsonc`. Do not add `routes` or `custom_domain` there: a build fails
  if the zone or its DNS records conflict.
- There is no engine variable any more. An old `VITE_PREVIEW_ENGINE` value is
  ignored and can be deleted.
- `VITE_PREVIEW_DEMO=1` is the only build variable. It turns on the testing-only
  `/preview-demo` page and must be removed before any public launch (unset or
  not `1`; the route then returns 404).
- `VITE_*` variables are read at build time, not at runtime, so they are
  Cloudflare **build** variables; a runtime variable has no effect.
- Never set any `VITE_*_TOKEN` variables. Every `VITE_*` value is copied into
  the public JavaScript that anyone can read.
- Never commit secrets.
