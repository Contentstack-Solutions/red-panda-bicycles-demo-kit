# Manual steps: where each one lives

Every step a person has to do in the Contentstack, Lytics or Launch interface is written once, in `docs/manual-steps.md`. This file only maps them to phases. Don't copy the steps into the chat: tell the SE which section to follow, what to tell you when it's done, and which check you'll run then.

These steps have no usable API with a management token, which is why a person does them.

| Phase | `docs/manual-steps.md` section | What it covers | The SE tells you | Then run |
|---|---|---|---|---|
| 1 Keys | §1 Create the stack (master language English) | New stack with master language **English (en)**; API key, region hosts, organization UID | "done" and any non-secret values (region, org UID) | `npm run kit:doctor -- --phase keys` |
| 1 Keys | §2 Create the tokens | Delivery, preview and management (write) tokens; `CONTENTSTACK_ENVIRONMENT` | "done" (tokens go straight into `.env.local`) | `npm run kit:doctor -- --phase keys` |
| 1 Keys | §3 Pick the Launch project name now | Sets `SITE_URL` to the Launch address before seeding | the project name or domain | the setter in `references/phases.md` |
| 1 Keys | §7 Lytics API token and account ID | Admin token, `LYTICS_TAG`, `DEMO_PERSONA_EMAIL` | the account ID and persona email (not the token) | `npm run kit:doctor -- --phase keys` (Lytics is checked in phase 4) |
| 2 Commerce | §4 Install the RP Commerce app | App install; optionally the store ID, store token and API URL | "done" | `npm run kit:doctor -- --phase commerce` |
| 3 Contentstack | §5 Developer Tools and Audience Insights | Optional marketplace apps | "done" or "skip" | none |
| 3 Contentstack | §6 Enable Live Preview | Settings → Live Preview, environment `preview`, the preview token | "done" | none |
| 5 Personalize | §8 Personalize project, connected to Lytics | Project, Lytics integration, project UID, edge URL | the project UID and region | `npm run kit:doctor -- --phase personalize` |
| 5 Personalize | §9 Log in from Terminal | `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login`, run by the SE | "logged in" | `npm run kit:doctor -- --phase personalize` |
| 5 Personalize | §12 Attach the four event keys as goals | After `npm run kit:personalize`: goals on **Homepage – Reliability and range** | "done" | none |
| 5b Brand Kit | §10 Create the Brand Kit | Kit in the same organization; `BRAND_KIT_UID` | the Brand Kit UID | `npm run kit:doctor -- --phase brandkit` |
| 5b Brand Kit | §11 OAuth fallback | Only when `npm run kit:brandkit` gets 401 or 403 | "token stored" (never the token) | `npm run kit:brandkit` |
| 6 Run | §13 Create the Launch project and deploy | Project from GitHub, environment variables (the skill gives the SE a command to print them), deploy, redeploy after env changes | the Launch URL | `npm run kit:verify -- --site <url>` |
| 8 Presenter | §14 Profile Hub profile → `docs/mcp-profile.md` | Profile **Red Panda Insights**, its tool list, the `claude mcp add` command, `/mcp` sign-in | "connected" | `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs doctor` |
