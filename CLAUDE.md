# CLAUDE.md

Rules for anyone (human or AI) working on this fork of bolt.diy.

## Project goal

- We are removing `@webcontainer/api` completely.
- Previews will be built in the browser with `esbuild-wasm` and shown in an
  `<iframe>` with `sandbox="allow-scripts"`.
- When the work is finished, nothing in the app may depend on `@webcontainer/api`.

## How to build the replacement

- Put the replacement behind a small interface (start from
  `app/lib/webcontainer/types.ts`). The rest of the app should talk to that
  interface, not to a specific engine, so a second engine can be added later.
- Do not import types from `@webcontainer/api` in new code. Use
  `~/lib/webcontainer/types` instead.

## Security

- Never put secret keys in the code, in anything sent to the browser, or in logs.

## Pages and headers

- Keep payments and login on normal pages.
- The preview must NOT need cross-origin isolation headers
  (`Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy`).

## Way of working

- Make small changes.
- Finish every task by listing the files that were changed.

## Deployment

- The Cloudflare production branch for this test deploy is `esbuild-shim-1`.
- Set `VITE_PREVIEW_ENGINE` as a Cloudflare **build** variable. It is read at
  build time, not at runtime, so a runtime variable has no effect.
- Never set any `VITE_*_TOKEN` variables on a public deploy. Every `VITE_*`
  value is copied into the public JavaScript that anyone can read.
- Never commit secrets.
- The `/preview-demo` page and its `VITE_PREVIEW_DEMO` flag are for testing
  only. Before any public launch, remove the page or keep the flag off (unset
  or not `1`); with it off the route returns 404.
