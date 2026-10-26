---
name: integrate-page-builder
description: Use when the user wants to add the page builder (service, Merchant Center page editor and a client renderer) to a real client application on a commercetools project — a storefront, a mobile app or any other front end. Triggers - "integrate the page builder", "add the page editor to <project>", "deploy the page-builder service", "connect my storefront or app to the page builder", "make this app's pages editable in Merchant Center". Walks the whole path in order - deploy the service and the Merchant Center app, decide the client's contract, define the component vocabulary, render, publish the catalog, configure preview, author pages, verify, operate. Client-agnostic; web (Next.js) specifics are in references/.
version: 0.1.0
---

# Integrate the page builder into a client application

The page builder has three parts. Only the third is yours to build per client.

| Part | What it is | Where it lives |
|---|---|---|
| **Service** | Reads pages, resolves data, serves the render tree, ingests the catalog, gates preview | Deployed once per commercetools project (Connect) |
| **Merchant Center app** | Where authors compose and publish pages | Deployed once per commercetools project (Connect + MC registration) |
| **Client renderer** | Asks the service for a page, draws it with the client's own components | Inside each client app (web, mobile, ...) |

The client holds no commercetools credentials, no data resolvers and no storage logic. It draws what the service returns.

> **Status: v0.1 drafted from the reference host.** Steps are validated against the reference web storefront, not yet against a real project. Where a real integration teaches something, record it under [Integration log](#integration-log) and fix the step.

## The steps

**Platform: once per commercetools project**

1. **Deploy the page-builder service.** Outcome: a reachable service URL plus the secrets the other parts need.
2. **Deploy the Merchant Center app and point it at the service.** Outcome: authors can open the page editor.
3. **Prove the platform works before touching the client.** Outcome: known-good baseline; an empty project answers "no page", not an error.

**Client: once per client app**

4. **Decide the client's contract with the platform.** Outcome: written decisions on page types and URLs, markets, failure behavior and origins.
5. **Define the vocabulary.** Outcome: a validated catalog of components, data sources, sections and theme that matches the client's design system.
6. **Build the renderer.** Outcome: the client fetches a render tree for the current location and draws it, with distinct handling for "no page" and "failure".
7. **Implement the components the catalog names.** Outcome: every catalog type has a client component, including the route-driven product and listing ones.
8. **Publish the catalog.** Outcome: authors see the palette. Order: validate, deploy the client, push, publish.
9. **Configure preview and the two-way framing and origin allowlists.** Outcome: authors preview drafts (and, on web, edit in place) inside Merchant Center.
10. **Author and publish the first pages.** Outcome: home, category listing, product page and a content page are live.
11. **Verify end to end.** Outcome: published, preview, failure and latency behavior all checked against real data.
12. **Make it routine.** Outcome: the pipeline, secret rotation and upgrade path are written down and automated.

Steps 8 and 10 **write into the customer's commercetools project**. Show what will be written and get an explicit yes first.

## Ground rules

- **Intent before code.** For each step know what must be true afterwards; the commands and files are in `references/` and in the repos.
- **The client stays thin.** If you are about to add a commercetools client, a resolver or a cache to the client app, stop: that belongs in the service.
- **One owner per catalog.** Exactly one client pushes the catalog of a given commercetools project; two would overwrite each other.
- **Order is load-bearing.** Deploy the client before pushing a catalog that names its components. Register the MC app before deploying it. Know every client origin before deploying the MC app (it is baked into its CSP).
- **Deploys and registrations are the owner's.** Deploying to Connect and registering the Merchant Center app are done by the project owner, who has the credentials. The agent prepares the inputs, gives exact values and checks the result; it does not deploy or register.
- **Secrets never go in chat, commits or screenshots.** Generate them, put them in the platform's secret store and the client's CI secrets.
- **Distinguish "no page" from "failure"** everywhere in the client. They need different screens and different monitoring.

---

## Step details

Each step: what and why, what to decide, when it is done, what bites.

### 1. Deploy the page-builder service

**Intent.** One service per commercetools project is the only thing that touches the page-builder data. It serves the render API to clients, ingests the catalog from CI and exposes an object gateway to the MC app.

**Decide**
- Deployment type. A sandbox deployment scales to zero and cold-starts in about 15 s, longer than a client's render budget (2 s by default). Use a production-type deployment for anything shoppers touch.
- Region: the project's region.
- Source: a git repository with a release tag that Connect can stage (the connector lives in the page-builder repository, which has `connect.yaml` at its root). See the `commercetools-connect` skill for the CLI mechanics (stage, publish, deploy, redeploy).
- Secrets: a **render key** (clients present it), a **preview token** (unlocks drafts), an **admin secret** (catalog push from CI). Generate each randomly.
- Allowlists: the server origins of every client (render origins) and the Merchant Center origin of the project's region (editor origins).

**Facts to respect**
- commercetools access comes from a platform-generated API client with least-privilege scopes (custom-object write plus product, category and store read). Nobody creates a client by hand.
- Product Search must be activated on the project; the service does not use the legacy search.
- Connect does not strip the application's endpoint from the URL, so every route lives under that path prefix. The service URL clients use **includes** it.
- The Merchant Center audience (the service's own public origin) is only known after the first deploy. Deploy, read the URL, set it, then **redeploy** (config change is a redeploy, never delete and recreate).

**Done when** the liveness route answers under the endpoint path, a render call without credentials is rejected, and the service log shows no start-up configuration problems.

**Watch out.** A service reached at the wrong path looks "healthy" at the root but 404s for every client call. Check the full URL a client will use.

Details: [references/platform.md](references/platform.md).

### 2. Deploy the Merchant Center app and point it at the service

**Intent.** The editor authors use. It talks to the service, not to commercetools custom objects, so authors need no custom-object permissions.

**Decide**
- The entry-point path and cloud region (must match the project; unique per region).
- Which hook families go through the service. Start with all; the setting exists so a rollout can be staged or rolled back per family.
- **Every client origin that will be previewed inside the editor** (production, staging, local development). The MC app's content-security policy must list them as frame sources; adding one later means a redeploy, so collect them in step 4 first.
- Which teams get view and manage permissions.

**Order of operations.** Register the custom application in Merchant Center with a placeholder URL, take its id, deploy via Connect with the id, entry path and region, read the deployed URL, then update the registration with it. The service must trust this app's gateway: its issuer matches the project region and its audience is the service origin (step 1).

**Done when** the app appears in the menu for a permitted user, the Pages screen loads, and the service log shows authenticated gateway calls succeeding (not 401, not 403).

**Watch out.** A forwarded call that is rejected as "wrong audience" almost always means the audience was set with a path or the wrong origin.

Details: [references/platform.md](references/platform.md).

### 3. Prove the platform works

**Intent.** Establish a baseline so later failures are attributable to the client work, not the platform.

**Check**
- Liveness under the endpoint path.
- A render call with the render key and an allowed origin on an empty project answers **404 with the code for "no page"**. That is the healthy empty state. Any other 404 means a wrong URL or path prefix.
- The MC app loads and its palette is empty (no catalog yet).
- Latency of a render call on the production-type deployment, against the client's budget.

**Done when** all four hold and the URL, keys and origins are recorded somewhere the client's CI can read them. Nothing has been written to the project yet.

### 4. Decide the client's contract with the platform

**Intent.** The platform is generic; these decisions make it fit this client. Write them down before building.

**First, inventory the client (read-only).** Before deciding, read the client for the things that constrain the integration: its routes and which pages are native today; how markets and locales appear in URLs and in sessions; its security headers (can it be framed?); any access gate or login wall in front of it; its architecture and lint rules (what components may import, how links and colors are done); where its content comes from today; its build and deploy pipeline and whether it is in a separate repository from the page builder.

**Decide**
- **Adoption scope.** Which existing pages become page-builder driven, and in what order. Prefer content-led pages (home, landing and editorial pages) first. Keep transactional pages (product detail, listing, cart) native until the content-led ones are proven; their system components replace native behavior and are the riskiest swap.
- **Page types and URL scheme.** Which of home, category listing, product detail and free-form content pages the client has, and the path template of each. The service uses the same templates to map a path to a page, so the client's navigation must produce exactly those paths.
- **Markets.** How the client derives locale, currency, country and (optionally) the commercetools store key for every request. Check that "store" means a commercetools store: some clients use the word for a pickup or collection location, which is not what the render call's `store` is. Omit it when the client does not scope its catalog by commercetools store.
- **URL casing and the locale segment.** Whether the locale in the URL matches the locale value the service receives and whether route templates keep a locale placeholder.
- **Which surfaces are page-builder driven.** Whole screens, or regions of otherwise native screens (common on mobile).
- **Failure behavior.** What the shopper sees when there is no page (a real "not found") versus when the service is down or slow (a degraded but usable screen). Budget a short timeout; never let the service block the whole screen.
- **Origins.** Every environment's origin, for the service allowlists (step 1) and the MC frame sources (step 2).

**Done when** the decisions are written in the client's own docs and the allowlists in steps 1 and 2 contain every origin.

### 5. Define the vocabulary

**Intent.** The catalog is the contract between what developers can render and what authors can place. The client owns it.

**Decide**
- **Components.** Inventory the design system's real building blocks and choose which are authorable. Model what an editor varies, not every prop. Each gets a stable type key, typed fields (text, rich text, number, boolean, select, image, link, repeatable group, data source), the sections and page types it may appear in, and a group for the palette.
- **Data sources.** What dynamic data components can bind to (product lists, category lists, a product, ...). Each names a service-side resolver kind; the client never resolves data.
- **System components.** The route-driven ones (product detail, category listing) take their data from the URL and expose named slices (price, gallery, facets, ...). Decide which slices the client's design needs.
- **Sections and theme.** The named regions of a page and the tokens that map to the design system (container width, gaps, section backgrounds).

**Done when** the catalog file validates (the service checks structure and references, and reports every violation at once).

### 6. Build the renderer

**Intent.** One place in the client turns the current location plus market into a drawn page.

**Responsibilities**
1. Build the request: current path, market, and the query string exactly as received (preview and edit flags and listing filters ride on it).
2. Authenticate to the service with the render key, and identify the client's origin (server-side calls have no browser origin).
3. Send the contract's wire version, and handle "upgrade required" by degrading and reporting.
4. Apply a short timeout.
5. Classify the outcome into **ok**, **no page** (the service's own "no page" answer only) and **failure** (timeout, network, rejected credentials, wrong URL, bad response, server error). A bare 404 without the "no page" code is a misconfiguration, not a missing page.
6. Draw the tree: sections, rows, cells, using the client's own layout primitives, honoring the contract's breakpoints and per-device hiding.
7. Do not cache page content in the client; the service caches reads briefly.

**Done when** each outcome has its own screen and the failure path is logged with its reason.

Platform-neutral contract: [references/render-contract.md](references/render-contract.md). Web: use the shim ([references/web-nextjs.md](references/web-nextjs.md)), including how it reaches a client that lives in a different repository. Other platforms implement the contract directly.

### 7. Implement the components the catalog names

**Intent.** Each catalog type becomes a client component receiving already localized data.

**Do**
- Read and follow the client's own conventions first (its link component, design tokens, accessibility and lint rules, import boundaries). Authored components are ordinary client code and must pass the same gates.
- Map every type key to a component. Unknown types must fail soft (skip and log), not crash the page.
- Consume data in the service's canonical shapes (product card, product detail, category node, search result). Do not re-fetch from commercetools.
- Implement the system components using their slices; a slice may be absent, so each piece degrades.
- Own empty, loading and error states per component.
- Links and images come from fields; resolve link targets with the client's router so navigation stays native.
- On web, mark editable text so the visual editor can edit in place (inert for shoppers). Native clients skip this.

**Done when** every type in the published catalog renders with sample data and with missing optional fields.

### 8. Publish the catalog

**Intent.** Make the vocabulary visible to authors, safely.

**Order.** Validate on every change request (writes nothing) → deploy the client → push (writes a draft; repeating is a no-op) → publish (the go-live gate). Pushing before the client is deployed would let authors place a component the live client cannot draw.

**Do** wire the three calls into the client's pipeline using the admin secret from the CI secret store. **Confirm with the user before the first push**: it writes into the project.

**Done when** the MC palette lists the components, data sources and sections, and reading the catalog back shows the published state.

### 9. Configure preview and the allowlists

**Intent.** Authors see drafts in the real client, inside Merchant Center.

**Do**
- In the editor's preview settings set: enabled, base URL per environment, the shared draft token (equal to the service's preview token), locales, the route templates from step 4, a sample product for product-page previews, the home page id.
- The client must forward its full query string to the service (it carries the draft flag, the page id and the edit flag).
- The client must **allow being framed** by Merchant Center (frame-ancestors or the platform equivalent) for the project's region.
- The MC app's frame sources (step 2) and the service's editor origins (step 1) must include the client's origin and the MC origin respectively.
- **Check what stands between the frame and the page.** Clients often forbid framing by default (`frame-ancestors` none, `X-Frame-Options` deny) and may put an access gate or login in front of the site. A gate that relies on a cookie does not work inside a cross-site frame, so decide how preview passes it (for example a preview request carrying the draft token bypasses the gate, or preview targets an environment with no gate).
- Visual editing (selecting, reordering and editing in place) uses a browser message protocol and DOM markers, so it is **web only**. Native clients get draft preview through the same flags but no in-place editing.

**Done when** opening a page from the editor shows the draft in a frame; a wrong token shows the published page.

### 10. Author and publish the first pages

**Intent.** Content exists, authored by the people who will own it.

**Do**
- Author in the Merchant Center editor: home, the category listing fallback, the global product page template, and a content page. Save as draft, preview, publish.
- Seed scripts exist for local development; they write directly with an API client and are not for customer projects.
- **Confirm before writing anything on the author's behalf.**

**Done when** each page type renders for real paths in the client from published content.

### 11. Verify end to end

**Check**
- Every page type, every market, desktop and small screen.
- Draft preview with the token; a wrong token shows the published page; edit mode (web).
- **Failure modes on purpose:** service stopped → degraded screen, not "not found"; a path with no page → real "not found"; a wrong service URL → a logged error, not a silent "not found".
- Latency of the render call at p95 against the client budget, measured on the production-type deployment.
- A real shopper path never exposes preview flags or tokens.
- Accessibility of authored output (headings, alt text from image fields).

**Done when** the checks pass against real data and the results are in the client's docs.

### 12. Make it routine

- **Pipeline order:** deploy client → push catalog → publish catalog; validate on change requests.
- **Secrets:** how the render key, preview token and admin secret are rotated (a render key change needs the service and every client updated together).
- **Upgrades:** the wire version is negotiated; an old client against a newer service degrades and logs. Plan service-then-client upgrades.
- **Observability:** where service logs are read; the client logs failure reasons.
- **Ownership:** who owns the catalog, who authors pages, who holds the secrets.

---

## Integration log

Append what each real integration teaches. Format: date, project type, step, what happened, what the step should say now.

- **2026-10-26, web storefront (Next.js, locale-prefixed URLs, access gate), read-only inventory, steps 4 and 9.**
  - The client's security headers forbid framing entirely. Step 9 must change them for the environments used for preview.
  - A cookie-based access gate sits in front of the site, so the editor's frame would hit the gate. Step 9 now says to decide how preview passes it.
  - The client's lint and architecture rules restrict component imports and require its own link component and design tokens. Step 7 now says to read them first.
  - Home, category and product pages exist natively; the client has its own cart and pricing flow. Step 4 now has "adoption scope": start with home and content pages, keep product and listing pages native.
  - The word "store" in the client means a pickup location, not a commercetools store. Step 4 now says to check, and to omit `store` otherwise.
  - The client and the page-builder repository are separate repositories, so a local file link does not resolve in the client's CI. See web-nextjs.md.
