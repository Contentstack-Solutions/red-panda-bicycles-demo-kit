# Setup phases in detail

One section per phase, in order. Each gives the check, the command, what success looks like (and the `.kit/state.json` key that records it), the manual steps, and what to do when it fails. Section numbers (§) refer to `docs/manual-steps.md`. Exit codes: 0 ok · 1 error · 2 missing input or credential · 3 a person's decision, nothing changed.

Every kit command can be run again safely. A re-run after a failure finishes only what's missing.

## Setting a non-secret value in `.env.local`

Never open `.env.local`. When the SE tells you a non-secret value (`SITE_URL`, `DEMO_PERSONA_EMAIL`, `CONTENTSTACK_ENVIRONMENT`, `CONTENTSTACK_PUBLISH_ENVIRONMENTS`, `CONTENTSTACK_REGION` and the host values, `CONTENTSTACK_ORGANIZATION_UID`, `CONTENTSTACK_PERSONALIZE_PROJECT_UID`, `CONTENTSTACK_PERSONALIZATION`, `CONTENTSTACK_PERSONALIZE_EDGE_API_URL`, `CONTENTSTACK_PERSONALIZE_API_HOST`, `CONTENTSTACK_BRANDKIT_API_HOST`, `CONTENTSTACK_AI_HOST`, `LYTICS_TAG`, `BRAND_KIT_UID`), set it with this one line, which replaces the key's line (including an `export KEY=` line) or appends it:

```
node -e 'const fs=require("fs"),[k,v]=process.argv.slice(1),p=".env.local",l=k+"="+v,re=new RegExp("^[ \\t]*(export[ \\t]+)?"+k+"[ \\t]*=.*$","m");let t=fs.readFileSync(p,"utf8");fs.writeFileSync(p,re.test(t)?t.replace(re,()=>l):t.replace(/\n?$/,"\n")+l+"\n");console.log("set "+k)' SITE_URL 'https://my-red-panda.contentstackapps.com'
```

Never use it for a token (`CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_DELIVERY_TOKEN`, `CONTENTSTACK_PREVIEW_TOKEN`, `LYTICS_ACCESS_TOKEN`, the RP Commerce store token, any authtoken). The SE pastes those into `.env.local` in their editor.

## 0. Prereqs

- **Check:** `node -v` prints 20.6 or newer. (Every doctor run also checks this.)
- **Command:** `npm ci`
- **Success:** `npm ci` exits 0. No state key.
- **Manual:** none. Before going on, confirm the SE has what the later phases need: a Contentstack organization with Personalize, Launch, Brand Kit and the Profile Hub app; a Lytics account (a dedicated sandbox is best, because Lytics profiles and events can't be deleted through the API); access to the RP Commerce app from its owner; and their own GitHub copy of this repo for Launch to deploy from.

## 1. Keys

- **Manual:** §1 (create the stack with master language English, `en`), §2 (the site's environment, then the delivery, preview and management tokens), §3 (pick the Launch project name), §7 (Lytics token, account ID, persona email).
- **Command:** if `.env.local` doesn't exist, `cp .env.example .env.local`. The SE fills in the tokens in their editor; you set the non-secret values they tell you with the setter above.
- Make sure of these as you go:
  - **Master language `en`.** It can't be changed later, and `npm run kit:import` exits 2 on any other. If the stack isn't English, the SE creates a new one.
  - **`SITE_URL` is the Launch address** (`https://<project-name>.contentstackapps.com`, or their custom domain), never localhost. `npm run kit:lytics` exits 2 on localhost, because seeded page views use the site's domain.
  - **`DEMO_PERSONA_EMAIL`** is lowercase with no `+` or spaces (doctor rejects it otherwise).
  - **Publish environments:** the setup publishes to `CONTENTSTACK_PUBLISH_ENVIRONMENTS`, else `CONTENTSTACK_ENVIRONMENT`, else `preview`. `.env.example` leaves it blank, so the site's environment is used; to publish to more, set it to a list such as `preview,<another environment>`.
  - A delivery token needs an environment to scope to, and an empty stack has none. The SE creates the site's environment (for example `preview`, URL = `SITE_URL`) in **Settings → Environments** first (§2); the import adopts environments that already exist and never deletes them.
  - **Non-US regions:** set `CONTENTSTACK_PERSONALIZE_API_HOST`, `CONTENTSTACK_BRANDKIT_API_HOST` and `CONTENTSTACK_AI_HOST` to the region's hosts. Doctor warns (`!`, not a failure) when `CONTENTSTACK_REGION` isn't `us` and they're blank. Outside the US this is untested.
- **Check:** `npm run kit:doctor -- --phase keys`
- **Success:** doctor exits 0 with every line passing (`node`, `env`, `cma`, `delivery-token`, `persona`). No state key.
- **Failure:** exit 2 lists what's missing or rejected, with a fix for each. Pass on the fix, wait, re-check.

## 2. Commerce

- **Manual:** §4 (install RP Commerce; the store ID, store token and API URL go in `.env.local`; the store token is a secret, so the SE pastes it).
- **Check:** `npm run kit:doctor -- --phase commerce`
- **Command:** none.
- **Success:** doctor exits 0 (`commerce-app` finds the extensions `RP Commerce Products` and `RP Commerce Category`; `commerce-store` reaches the store). No state key.
- **Failure:** missing extension titles mean the app isn't installed in this stack, or is a different version. Getting access is the SE's job (ask the app owner). The import checks again and stops before writing anything.

## 3. Contentstack

- **Check:** `npm run kit:doctor -- --phase contentstack`
- **Command:** `npm run kit:import -- --dry-run` to show the plan, then `npm run kit:import`. It creates languages, environments, taxonomies, global fields, content types (in two passes), asset folders and assets, entries, and publishes them.
- **Success:** exits 0; `.kit/state.json` has `phases.contentstack.done` and `ids.homepage` / `ids.heroBanner`.
- **Manual, after the import:** §6 (enable Live Preview: Settings → Live Preview, environment `preview`, the preview token; the management token can't change it). §5 (Developer Tools, Audience Insights) is optional.
- **Failure:**
  - Exit 2, master language: the stack isn't `en`. The SE creates a new stack (§1) and updates `CONTENTSTACK_API_KEY` and the tokens.
  - Exit 2, "nothing was published": none of the publish environments exists in the stack. Everything else was imported. The SE creates the missing environment (§2) or fixes `CONTENTSTACK_ENVIRONMENT` / `CONTENTSTACK_PUBLISH_ENVIRONMENTS`; then re-run, which publishes what was skipped.
  - Exit 3, conflicts: the stack already has content the kit didn't create. It lists the conflicts and never overwrites. Ask the SE: use a new, empty stack, or remove those items themselves.
  - Exit 1 partway (for example a 429): re-run. It picks up its UID map and creates only what's missing.

## 4. Lytics

- **Check:** `npm run kit:doctor -- --phase lytics`
- **Seed date:** the seeded history is dated back from "now", so counts like "bought more than a year ago" drift as the weeks pass. Ask the SE when the demo is. If it's more than a week or two away, suggest pinning the date close to it with `--now`.
- **Command:** `npm run kit:lytics`, or `npm run kit:lytics -- --now 2026-12-01T09:00:00Z`. It applies account settings, runs the seeder (`schema → topics → load → refresh → audiences → model`), waits for the audiences and lookalike models to build, and records the measured counts. It can take 30 minutes or more: run it in the background and tell the SE what you're waiting for. `-- --dry-run` shows the plan.
- **Success:** exits 0; `phases.lytics.done` is true, and `expected` holds this account's measured counts (`q1`, `q2`, `q3`, `volt_owners_commuting`, `roam_preorder`, `roam_intent`). `q1`–`q3` are the saved funnel audiences `near_amsterdam`, `near_amsterdam_volt_owners` and `near_amsterdam_volt_commuters`, which Claude counts live for Act 1 questions 1–3. Show them with `npm run kit:verify -- --counts`.
- **Failure:**
  - Exit 2 about `SITE_URL`: it's localhost or unset. Set it to the Launch address (phase 1) and re-run.
  - Exit 3, "already has seeded profiles": this Lytics account was seeded before, but the local seed state is empty. **Stop and ask.** The options are to restore `scripts/lytics/.state/seed-state.json` from where it was last run, or to load a second copy on purpose, which adds a second history and inflates scores. That second option means running the seeder with `--repin`: only with the SE's explicit OK in the chat, and never `--resend` without the same.
  - Exit 1, or a timeout while waiting: re-run. Finished steps are skipped.

## 5. Personalize

- **Manual first:** §8 (create the Personalize project, connect Lytics, set `CONTENTSTACK_PERSONALIZE_PROJECT_UID` and `CONTENTSTACK_PERSONALIZATION` to the project UID, and `CONTENTSTACK_PERSONALIZE_EDGE_API_URL`), then §9: the SE runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in their own Terminal. You can't run it for them.
- **Check:** `npm run kit:doctor -- --phase personalize`
- **Command:** `npm run kit:personalize -- --dry-run`, then `npm run kit:personalize`. It makes `volt_owners_commuting` public, waits for it to sync into Personalize, creates and activates the experience **Homepage – Reliability and range** (variant **Volt Owners × Commuting**), creates and publishes the hero entry variant, and creates the four event keys.
- **Success:** exits 0; `phases.personalize.done`.
- **Manual, after:** §12 (attach the four event keys as goals on the experience).
- **Failure:**
  - Exit 2 with a 401 or 105: the session token expired. The SE runs `rp.mjs login` in Terminal again; then re-run. Nothing was half-done.
  - Exit 1, "Audience not in Personalize after 5 minutes": the Lytics connection (§8) is missing, or the sync is slow. Check §8, then re-run.
  - Exit 3: the base `hero_banner` has unpublished edits (publishing the variant would publish them too), or an object needs a decision. Read the message and hint to the SE and ask. Nothing was changed.

## 5b. Brand Kit

- **Manual first:** §10 (create the Brand Kit in the same organization; set `BRAND_KIT_UID` and `CONTENTSTACK_ORGANIZATION_UID`).
- **Check:** `npm run kit:doctor -- --phase brandkit`
- **Command:** `npm run kit:brandkit` (`-- --dry-run` lists the 15 Knowledge Vault items and 2 voice profiles).
- **Success:** exits 0; `phases.brandkit.done`.
- **Failure:**
  - Exit 2 with 401 or 403: the Brand Kit APIs rejected the session token. Nothing was changed. Follow §11 (OAuth fallback) and `references/troubleshooting.md` → *Brand Kit rejects the token*.
  - "isn't visible in the Knowledge Vault" (exit 1 or 3): writes are asynchronous. Wait a minute and re-run; finished items are skipped.
  - Exit 3, "couldn't tell which Knowledge Vault item it is": tell the SE the title and ask them to check the Knowledge Vault for duplicates before re-running.

## 6. Run (local, then Launch)

**Local first:**
1. Start the dev server: `npm run dev` in the background, or the `dev` configuration in `.claude/launch.json` (port 3000).
2. **Check:** `npm run kit:doctor -- --phase site` (it also checks that `CONTENTSTACK_PERSONALIZATION` holds the Personalize project UID)
3. `npm run kit:verify -- --site http://localhost:3000`. Success: both `site:` lines pass. (The Lytics line checks the persona's profile, which doesn't depend on where the site runs.)

**Then Launch:** §13. The SE creates the project from their GitHub copy of the repo, with the name picked in phase 1.

- **Environment variables:** ask the SE to run this in their own Terminal, in the repo folder, and paste the output into Launch's environment variables. Don't run it yourself: it prints values, and they don't belong in this chat. It leaves out comments, the management token, the Lytics token and any authtoken, and sets `HOSTING=launch`:

  ```
  { grep -vE '^[[:space:]]*(#|$)|^[[:space:]]*(export[[:space:]]+)?(CONTENTSTACK_MANAGEMENT_TOKEN|LYTICS_ACCESS_TOKEN|[A-Z_]*AUTHTOKEN)[[:space:]]*=' .env.local | sed -E 's/^(export[[:space:]]+)?HOSTING=.*/HOSTING=launch/'; grep -qE '^HOSTING=' .env.local || echo HOSTING=launch; }
  ```

- Remind them: **after any change to Launch's environment variables, redeploy**. Launch reads them at build time.
- **Check:** `npm run kit:verify -- --site https://<project>.contentstackapps.com`
- **Success:** every line passes against the Launch URL. A local pass doesn't prove Launch: Launch runs the edge function in `functions/`, not `src/middleware.ts`. No state key.

## 7. Verify

- **Check:** `npm run kit:verify` (uses `SITE_URL`, the Launch address).
- **Command:** `npm run kit:verify -- --counts` prints this account's own audience counts against the ones measured in phase 4 (±5%).
- **Success:** exit 0 and "All checks passed." No state key.
- Then offer the browser journey check (sign in as the persona, see the hero change, sign out), which is in the `red-panda-demo-ops` skill.

## 8. Presenter (Profile Hub)

- **Manual:** §14, which points to `docs/mcp-profile.md`. The SE creates the Profile Hub profile **Red Panda Insights** with exactly the tools listed there, then runs the `claude mcp add --transport http red-panda-insights "…"` command from the profile's **Claude Code** tab in their Terminal.
- They restart Claude Code in this repo, run `/mcp`, choose `red-panda-insights` and sign in.
- **Check:** `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs doctor`: the `ready` flags for Lytics, Personalize and CMS writes are all true. Then, in a new session, ask "List our Lytics audiences." It should answer through the `red-panda-insights` tools and include `roam_preorder`.
- **Success:** `/mcp` shows `red-panda-insights` connected and the helper's doctor is ready. No state key.
- **Failure:** tool definitions are cached for 5 minutes after a profile edit: reconnect with `/mcp` or wait. If the SE can't create a custom profile, `docs/mcp-profile.md` → *Fallbacks* has the system profiles and the local MCP.
