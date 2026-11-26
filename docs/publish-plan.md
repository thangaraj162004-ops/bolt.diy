# Publish plan (Task 10A): a "Publish" button with a free live link

Status: PLAN ONLY. Nothing here is built yet.

Goal: a logged-in **Pro** or **Ultra** user taps **Publish** and gets a free live
link to the website they built. Pro may publish up to **5** projects, Ultra up to
**20**. It must cost **nothing** until there is income.

> Cloudflare's documentation could not be opened from the build environment, so
> the free-plan numbers below come from memory. Every number marked **(verify)**
> must be checked on developers.cloudflare.com in task 10B before any code is written.

---

## 1. What exists today

- **Deploy button** (`app/components/deploy/DeployButton.tsx`) offers Netlify,
  Vercel, GitHub and GitLab, plus a disabled "Deploy to Cloudflare (Coming Soon)".
- Every one of them needs the **user's own account** and a personal access token
  that the user creates and pastes into Settings. The token is kept in the
  browser (for example `localStorage` `netlify_connection`) and sent to small
  server routes (`/api/netlify-deploy`, `/api/vercel-deploy`, ...).
- Before deploying, the app runs `npm run build` in the in-browser preview. The
  result is **one self-contained file**, `dist/index.html`: the app's JavaScript
  and CSS are inlined, and packages (React and so on) load from esm.sh.
  So publishing a site means uploading **one HTML file**.
- There is **no "project" table** yet. Plans (`profiles.plan`, `plan_until`) exist
  from migration 0003, so the server can already tell Pro from Ultra.

---

## 2. The three options

### A) Cloudflare Pages, Direct Upload, links like `name.pages.dev`

How it works: our server uploads the user's `index.html` to a Cloudflare Pages
project in **our** Cloudflare account and gets back a link.

- **Cost:** free. Pages static hosting has no charge for requests or bandwidth.
- **Free limits (verify):**
  - about **100 Pages projects per account**, so **one project per site does not scale**;
  - about **500 deployments (builds) per month** on the free plan; it is not
    certain whether Direct Uploads count toward this;
  - up to 20,000 files per deployment and 25 MiB per file (one file is far below that).
- **The way around the project limit:** use **one** Pages project (for example
  `codeapp-sites`) and give every published site its own **branch**. Each
  branch gets its own link: `my-shop.codeapp-sites.pages.dev`. Republishing
  replaces that branch's deployment. **(verify that branch links stay live and
  that there is no low limit on branches.)**
- **What you create in the dashboard:**
  1. Ideally a **second, separate Cloudflare account** used only for user sites
     (see the security notes below).
  2. In it, one Pages project, `codeapp-sites`, created with "Direct Upload".
  3. An **API token** with only the permission *Account → Cloudflare Pages → Edit*,
     limited to that account.
  4. The **Account ID** (shown on the account's overview page).
  5. Three runtime secrets on the `codeapp-ai` Worker: `CF_SITES_ACCOUNT_ID`,
     `CF_SITES_API_TOKEN`, `CF_SITES_PROJECT` (never `VITE_`, never in the browser).
- **Security risks:**
  - Many users publish under **your** account. If someone publishes a phishing
    or scam page, Cloudflare may get abuse reports. In the worst case it could
    suspend the account, and with it everything in that account. **That is why
    the sites should live in a separate account**, away from the `codeapp-ai`
    Worker.
  - The API token can change every site in that account. It must stay a server
    secret, with the smallest permission, and only our server uses it.
  - User pages run on `*.pages.dev`, a different site from the app, so a
    published page cannot read the app's login or cookies. Good.
- **Effort:** medium. The upload is a few API calls (upload the file, then create
  a deployment for the branch). Wrangler does this internally; we would call the
  same Cloudflare API from our server **(verify the exact Direct Upload API
  calls)**. Plus a database table for the project limits, a server route and the
  button.

### B) Cloudflare Workers static assets

How it works: each published site becomes its own small Worker with static
files, with a link like `my-shop.<your-subdomain>.workers.dev`.

- **Cost:** free to start. Requests for static files are free **(verify)**.
  Anything that runs Worker code counts toward the **100,000 requests per day**
  that are shared with the `codeapp-ai` app on the free plan.
- **Free limits (verify):** about **100 Worker scripts per account**. That is the
  same problem as one Pages project per site: about 20 Pro users would fill it.
- **What you create:** the same kind of separate account, an API token with
  *Workers Scripts → Edit*, the Account ID, and a workers.dev subdomain.
- **Security risks:** the same as A. In addition, if it lives in the **same**
  account as the app, user sites share the app's daily request limit and its
  abuse risk.
- **Effort:** higher than A. The upload flow for Worker assets has more steps,
  and every site is a separate Worker to create, update and delete.
- A variant (one shared "sites" Worker that serves every site from R2 storage on
  wildcard subdomains of a domain you own) scales well. But it needs a second
  domain and DNS setup, so it is a later option, not a start.

### C) The existing Deploy options (the user connects their own Netlify, Vercel ...)

How it works: what exists today. The user signs up at Netlify (for example),
creates a token, pastes it into Settings, then taps Deploy.

- **Cost to you:** zero. Hosting is on the user's own free account.
- **Free limits:** the user's own (Netlify and Vercel free plans are generous for small sites).
- **What you create:** nothing.
- **Security risks:** lowest for you. Sites are in the user's account, not yours,
  so abuse is their account's problem. The user's token is kept in their browser
  (it is their own secret; it must never be logged).
- **Effort:** none (it already works through the in-browser build).
- **For a beginner on a phone it is the hardest:** create another account, find
  the "personal access token" page, copy a long token, paste it. Many will give up.

### Side by side

| | A) Pages, one project + branches | B) Workers static assets | C) User's own Netlify etc. |
|---|---|---|---|
| Cost to you | Free | Free to start, shares the app's daily limit | Zero |
| Link | `site.codeapp-sites.pages.dev` | `site.<you>.workers.dev` | `site.netlify.app` etc. |
| Scales to many users | Yes, with branches **(verify)** | No, about 100 scripts | Yes (each user's own account) |
| You must set up | Separate account, 1 Pages project, token, account id | Separate account, token, account id | Nothing |
| Risk to your account | Medium (abuse under your account), reduced by the separate account | Medium-high | Low |
| Easy for a beginner on a phone | **Yes: one tap** | Yes: one tap | No: sign-ups and tokens |
| Effort | Medium | High | None |

---

## 3. Recommendation

**Option A: Cloudflare Pages Direct Upload, one Pages project (`codeapp-sites`)
in a separate free Cloudflare account, one branch per published site.**

- One tap for the user, a real link, no sign-up elsewhere.
- Zero cost: static hosting on Pages is free, and the sites never touch the app's
  Worker request limit.
- A separate account keeps abuse problems away from the `codeapp-ai` app.
- **Keep option C** as the "advanced" choice for users who want the site in their
  own account.
- **Fallback:** if task 10B finds that branch links or deployment limits do not
  work as described, use the B variant (one "sites" Worker plus R2 on a domain you own).

Rules for every option we build:

- Only **logged-in Pro/Ultra users** with an active plan can publish; the
  **server** checks the plan and the count (Pro 5, Ultra 20), never the browser.
- Publishing is free in credits (it uses no AI). It could cost credits later if wanted.
- **Never** serve user sites on the app's own domain: their JavaScript would then
  run next to the app's login.
- The server checks the upload: one HTML file, a size cap (for example 5 MB),
  a safe name (`a-z`, `0-9`, `-`, 3 to 40 characters, not reserved words like `www`
  or `admin`), and a rate limit per user.
- Every user can **unpublish**. You can **take down** any site. Add a
  "Report abuse" link and short terms of use before public launch.

---

## 4. Small tasks, in order

- **10B: check the facts and prepare Cloudflare (no app code).** Read the Pages
  limits and the Direct Upload API docs and confirm the **(verify)** items above.
  Then, in the dashboard:
  - create the separate account and the `codeapp-sites` Pages project (Direct Upload);
  - create the API token (Pages: Edit, that account only) and note the Account ID;
  - add `CF_SITES_ACCOUNT_ID`, `CF_SITES_API_TOKEN` and `CF_SITES_PROJECT` as
    runtime secrets on `codeapp-ai`.
- **10C: migration `0005_published_sites.sql`.** A `published_sites` table (user,
  chat/project id, site name, link, status, timestamps; the site name unique).
  Users read their own rows; no browser writes. A server-only function that
  checks the limit by plan (Pro 5, Ultra 20, no plan 0) and adds or updates a
  site in one step.
- **10D: server route `POST /api/publish`.**
  - Checks: login, active plan, limit, site name, size and rate.
  - Uploads `index.html` to the site's branch in `codeapp-sites` and saves the row.
  - Republishing the same site updates it and does not count again.
  - Plain-English errors ("Publishing needs a Pro or Ultra plan", "You have
    published 5 of 5 sites"). A missing variable gives a 503. Secrets are never logged.
  - Tests with a fake Cloudflare API.
- **10E: the Publish button and dialog.**
  - Visible to logged-in users; Pro/Ultra can use it, others see "Get Pro to publish".
  - The user picks a site name.
  - The app runs the in-browser `npm run build` and sends `dist/index.html`.
  - It shows the link with Copy and Open, and "Published sites: 2 of 5".
- **10F: my sites, unpublish and takedown.** A list of the user's sites, with
  Open, Republish and Unpublish (removes the branch deployment and frees a slot).
  An admin-only way to take a site down. A "Report abuse" link.
- **10G: safety before launch.** Terms of use, a size and rate review, and a small
  "Made with CodeApp AI" footer link if wanted. Decide what happens to sites when
  a plan ends (for example keep them for 7 days, then unpublish).
- **10H: docs.** CLAUDE.md lines for the three secrets and the rules above; phone test steps.
