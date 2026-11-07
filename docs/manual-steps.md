# Manual steps

Everything the setup scripts can't do for you. Each section is one step in the Contentstack, Lytics or Launch interface, in the order setup needs them. The setup skill pauses at the right moment and sends you here. After each step, run `npm run kit:doctor -- --phase <name>` (named below) to check it.

Put values in `.env.local` (copy `.env.example` first). Never paste a token into the Claude chat.

## 1. Create the stack (master language English)

1. In Contentstack, choose **+ New Stack**.
2. Set **Master Language** to **English (en)**. You can't change the master language later. If it isn't English, `npm run kit:import` stops with exit code 2.
3. Open **Settings → Stack** and copy the **API Key** into `CONTENTSTACK_API_KEY`.
4. Note your region (the URL you sign in at) and set `CONTENTSTACK_REGION`, `CONTENTSTACK_HOST`, `CONTENTSTACK_MANAGEMENT_HOST`, `CONTENTSTACK_PREVIEW_HOST` and `CONTENTSTACK_APP_HOST` to match. The defaults in `.env.example` are for the US region.
5. Copy your organization UID (Organization → Settings) into `CONTENTSTACK_ORGANIZATION_UID`.

Use an empty stack. If the stack already has content, the import stops and lists what conflicts. It never overwrites.

## 2. Create the site's environment and the tokens

An empty stack has no environments, and a delivery token needs one to be scoped to. So create the environment first:

1. **Settings → Environments → + New Environment.** Name it `preview` (or the name you want the site to read), and set its URL to your `SITE_URL` (step 3). Put its name in `CONTENTSTACK_ENVIRONMENT`. `npm run kit:import` adopts an environment that already exists: it publishes to it and never deletes it, not even on tear-down.

Then, in **Settings → Tokens**:

1. **Delivery token**, scoped to that environment. Copy it into `CONTENTSTACK_DELIVERY_TOKEN`.
2. **Preview token** (a delivery token with preview enabled). Copy it into `CONTENTSTACK_PREVIEW_TOKEN`.
3. **Management token with write access.** Copy it into `CONTENTSTACK_MANAGEMENT_TOKEN`. Only the setup scripts use it. It never goes into Launch.

Check: `npm run kit:doctor -- --phase keys`

## 3. Pick the Launch project name now

The seeder needs to know the site's address before it runs. Choose the Launch project name now, then set `SITE_URL` to `https://<project-name>.contentstackapps.com` (or your custom domain). It must be the Launch URL, not localhost, before you run `npm run kit:lytics`, which stops if it's localhost. To check the site locally, pass `--site http://localhost:3000` to `npm run kit:verify` instead. You create the project itself in step 13.

## 4. Install the RP Commerce app (optional)

RP Commerce gives the site a live catalog, cart and checkout. Everything else works without it. Getting access is your responsibility: ask the app owner.

**With RP Commerce:**

1. Contentstack → **Marketplace → Apps** → install **RP Commerce** in your stack.
2. Open the app's configuration screen and copy the store ID, store token and API URL into `RED_PANDA_COMMERCE_STPRE_ID`, `RED_PANDA_COMMERCE_STPRE_TOKEN` and `RED_PANDA_COMMERCE_API_URL`. (The `STPRE` spelling is correct; it is the name the code reads.) Set all three or none.

Shoppers can then add to cart and check out. The checkout opens over the site, and a pre-order of the Roam (any product whose button says "Pre-order") is recorded in Lytics, so the Roam pre-order count goes up by one.

**Without RP Commerce:** skip this step, and run the import as `npm run kit:import -- --without-commerce`. It creates two read-only stand-in fields in place of the app's product pickers. They keep the product details saved with each entry. Product and category pages show those saved products; there's no cart or checkout. To switch to RP Commerce later, start again in a new stack.

You can also install the app and leave out the store settings: you can pick products in the CMS, and the site still shows the saved products with no cart.

Check: `npm run kit:doctor -- --phase commerce`. It warns, without failing, when the app or the store settings are missing.

## 5. Install Developer Tools and Audience Insights (optional)

In **Marketplace → Apps**, install **Developer Tools** and **Audience Insights** in the stack. The demo works without them. They help you show the site's data and the audience behind a visitor.

## 6. Enable Live Preview

1. **Settings → Live Preview**, then enable it.
2. Set the preview environment to `preview`.
3. Select the preview token from step 2.
4. Make sure `LIVE_PREVIEW_ENABLED=true` in `.env.local`.

## 7. Create the Lytics API token and find the account ID

1. In Lytics, **Account → Access Tokens**: create an **admin** token. Copy it into `LYTICS_ACCESS_TOKEN`.
2. In **Account → Account Settings**, copy the **Account ID** (the one in the JS tag, not the token) into `LYTICS_TAG`.
3. Choose the demo persona's email address and put it in `DEMO_PERSONA_EMAIL`. Lowercase, no `+`. The seeder and the site both use it, and Lytics search breaks on `+`.

Use a dedicated sandbox Lytics account if you can. Lytics profiles and events can't be cleanly deleted through the API.

Check: `npm run kit:doctor -- --phase lytics`

## 8. Create the Personalize project and connect Lytics

1. Contentstack → **Personalize** → create a project in your stack.
2. In the project, open **Integrations** and connect **Lytics**, using the Lytics account from step 7.
3. Copy the project UID (project **Settings**, also in the project URL) into both `CONTENTSTACK_PERSONALIZE_PROJECT_UID` (the setup scripts read it) and `CONTENTSTACK_PERSONALIZATION` (the site reads it under this name). They hold the same value.
4. Set `CONTENTSTACK_PERSONALIZE_EDGE_API_URL` to the Personalize Edge URL for your region, for example `https://personalize-edge.contentstack.com`.

## 9. Log in from Terminal

The Personalize and Brand Kit scripts need a Contentstack session token. In Terminal, in the repo folder:

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login
```

It asks for your Contentstack sign-in (and a 2FA code if you use one) and stores the token in the macOS keychain, or in `~/.red-panda/credentials.env`. Don't paste it anywhere or add it to `.env.local`. It expires after a few hours: when `npm run kit:doctor -- --phase personalize` reports a 401, run login again.

## 10. Create the Brand Kit

1. In Contentstack, open **Brand Kit** in the same organization and create a kit.
2. Copy its UID (in the page URL) into `BRAND_KIT_UID`.

Then `npm run kit:brandkit` fills it. Check: `npm run kit:doctor -- --phase brandkit`

## 11. If Brand Kit calls get 401 or 403 (OAuth fallback)

The Brand Kit APIs sometimes reject the session token from step 9. If `npm run kit:brandkit` says the authtoken was rejected, nothing was changed. Ask Claude to walk you through getting an OAuth token for the Brand Kit APIs, then re-run `npm run kit:brandkit`.

The OAuth token goes in the same credential store as the login token from step 9, under the name `CONTENTSTACK_OAUTH_TOKEN`: on a Mac, put the line `CONTENTSTACK_OAUTH_TOKEN=<token>` in a temporary file, run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs keys-import <file>` in Terminal and delete the file; otherwise add that line to `~/.red-panda/credentials.env`. Never put it in `.env.local` or the Claude chat. When it's stored, `npm run kit:brandkit` sends it as `Authorization: Bearer` instead of the login token.

## 12. Attach the four event keys as goals

`npm run kit:personalize` creates the event keys. Attaching them as goals is a UI step.

1. Personalize → your project → the experience **Homepage – Reliability and range**.
2. Add goals and attach these four event keys: `bike_recommendation_clicked`, `add_to_cart`, `checkout_started`, `preorder_completed`.
3. Save.

## 13. Create the Launch project and deploy

1. Contentstack → **Launch** → **New Project** → import from GitHub, and select your copy of this repo. Use the project name you picked in step 3.
2. Add environment variables. Paste all of `.env.local` **except** `CONTENTSTACK_MANAGEMENT_TOKEN`, `LYTICS_ACCESS_TOKEN` and any authtoken. Set `HOSTING=launch`. Set `SITE_URL` to the project's address.
3. Deploy.
4. After any change to the environment variables, redeploy. Launch bakes the values in at build time.

Check: `npm run kit:verify -- --site https://<your-site>`

## 14. Set up the Profile Hub profile

So Claude can answer questions from live Lytics data, create a Profile Hub profile named **Red Panda Insights**. The full steps and tool list are in [mcp-profile.md](mcp-profile.md).
