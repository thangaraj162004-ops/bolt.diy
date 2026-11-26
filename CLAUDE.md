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

## Supabase

- The app's own users and credits use Supabase. The browser client is
  `app/lib/supabase/client.ts`; it is `null` when not configured.
- It needs two build variables: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` (the public `sb_publishable_...` key).
- The secret key (`sb_secret_...`) and the legacy `service_role` key never go
  in build variables or browser code: every `VITE_*` value is public. The
  client refuses a key that looks secret.
- The database schema is in `supabase/migrations/`. Row Level Security is on
  for every table; the browser may only read its own rows, and credits change
  only through `spend_credits`, the signup trigger and
  `grant_credits_for_payment` (payments, service_role only).
- Each new AI message spends `CREDITS_PER_MESSAGE` (in
  `app/lib/supabase/credits-config.ts`). The check is on the server:
  `/api/chat` calls `spend_credits` as the logged-in user (their access token
  from the `Authorization` header, plus the publishable key) before it calls
  the AI, and refuses with "please log in" or "out of credits". The AI's own
  follow-up tool steps are free (`app/lib/.server/credits.ts`). The browser
  never spends credits.
- If the AI fails before any reply is sent, the credit is refunded once per request (`refund_credits`, migration 0004, `SUPABASE_SECRET_KEY`).
- Follow-up tool steps are free only with the server-signed `X-CA-Follow-Up` token for that paid message (runtime secret `CREDITS_TOKEN_SECRET`; without it they are charged).

## Payments (Razorpay, test mode first)

- Server routes: `POST /api/payments/create-order`, `/api/payments/verify` and
  `/api/payments/webhook` (code in `app/lib/.server/payments.ts`).
- Plans are in `app/lib/payments/packs.ts`: every name, price, credit amount and
  feature shown to users. Prices are in US cents; the currency is the one
  constant `PAYMENT_CURRENCY` (`USD`). Pro $25 = 350 credits, Ultra $60 = 900
  credits, Enterprise "Contact us" (cannot be bought). The server takes the
  price and credits from this file, never from the browser.
- A plan is paid once and lasts 30 days (`profiles.plan`, `profiles.plan_until`);
  buying again while active extends it by 30 days. Auto-renew is not built.
  Project limits in the plan text are placeholders and are not enforced.
- USD needs international payments enabled on the Razorpay account; otherwise
  create-order answers "Dollar payments are not enabled on this Razorpay
  account yet." Older rupee orders are still credited once (in their own
  currency) and set no plan.
- Temporary test switch: runtime variable `PAYMENT_TEST_INR=1` with a `rzp_test_` key makes orders INR (Pro ₹2500, Ultra ₹6000);
  it is ignored with a live key, and shown prices ($25, $60) and credits (350, 900) do not change. Remove it before launch.
- They need four server **runtime** variables, set as Cloudflare Worker
  secrets (Settings → Variables and Secrets, type "Secret"), never as build
  variables and never with a `VITE_` prefix:
  - `RAZORPAY_KEY_ID` (sent to the browser by create-order; Checkout needs it)
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
  - `SUPABASE_SECRET_KEY` (the `sb_secret_...` key; only these routes use it)
- They also use the `VITE_SUPABASE_URL` build variable. If a variable is
  missing, the route returns 503 and changes nothing.
- Never log secrets or request bodies. Credits for a payment are added only by
  `grant_credits_for_payment`, which adds them once however often verify and
  the webhook arrive.
- In the Razorpay dashboard the webhook URL is
  `https://<your domain>/api/payments/webhook`, event `payment.captured`, with
  the same secret as `RAZORPAY_WEBHOOK_SECRET`.

## Deployment

- The Cloudflare Worker is named `codeapp-ai` (`name` in `wrangler.jsonc`, which
  also matches `name` in `package.json`).
- The Cloudflare production branch for this test deploy is `esbuild-shim-1`.
- The custom domain is attached in the Cloudflare dashboard, not in
  `wrangler.jsonc`. Do not add `routes` or `custom_domain` there: a build fails
  if the zone or its DNS records conflict.
- There is no engine variable any more. An old `VITE_PREVIEW_ENGINE` value is
  ignored and can be deleted.
- `VITE_PREVIEW_DEMO=1` is the only build variable besides the two Supabase
  ones above. It turns on the testing-only
  `/preview-demo` page and must be removed before any public launch (unset or
  not `1`; the route then returns 404).
- `VITE_*` variables are read at build time, not at runtime, so they are
  Cloudflare **build** variables; a runtime variable has no effect.
- Never set any `VITE_*_TOKEN` variables. Every `VITE_*` value is copied into
  the public JavaScript that anyone can read.
- `CA_BUG_REPORT_REPO` (a runtime variable, not `VITE_*`) turns on the
  bug-report route; without it the route returns 404.
- Never commit secrets.
- The Cloudflare Worker `codeapp-ai` builds branch `esbuild-shim-1`.
