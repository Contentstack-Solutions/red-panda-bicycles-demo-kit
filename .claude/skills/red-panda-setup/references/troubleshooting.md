# Setup troubleshooting

Symptom → cause → what to do. Section numbers (§) refer to `docs/manual-steps.md`. For problems after setup (the hero doesn't change for the persona, a reset, a teardown), use the `red-panda-demo-ops` skill.

| Symptom | Cause | What to do |
|---|---|---|
| Any setup phase exits 3: "this state belongs to a torn-down setup" | `.kit/state.json` has a `tornDown` record from a teardown that didn't finish | Ask the SE: finish it with `npm run kit:teardown -- --yes` (which archives the state), or move `.kit/state.json` aside themselves. Don't do either without their OK. |
| `npm run kit:doctor` exits 2, `env` line "missing: …" | Values not in `.env.local` | Name the missing keys; `.env.example` says where each comes from. Tokens: the SE pastes them. Non-secret values: the setter in `references/phases.md`. |
| `cma` fails, "cannot read the stack (write scope?)" | Management token is read-only, or for another stack | §2: a management token **with write access**, and the right `CONTENTSTACK_API_KEY`. |
| `delivery-token` fails | Token scoped to a different environment than `CONTENTSTACK_ENVIRONMENT`, or wrong region host | §2; check `CONTENTSTACK_HOST` matches the region (§1). |
| `persona` fails | `DEMO_PERSONA_EMAIL` has a `+`, capitals or spaces | Use a plain lowercase address. Lytics search breaks on `+`. |
| `commerce-app` lists missing extension titles | RP Commerce isn't installed in this stack, or it's a different version | §4. Access is the SE's responsibility (ask the app owner). The import refuses to start without it. |
| `npm run kit:import` exits 2: master language | The stack's master language isn't English (`en`) | It can't be changed. The SE creates a new stack (§1) and updates the API key and tokens. |
| `npm run kit:import` exits 3 and lists conflicts | The stack has content the kit didn't create | Stop and ask. It never overwrites. Use an empty stack, or the SE removes those items. |
| The import stops partway (429, network) | Rate limit or a dropped connection | Re-run `npm run kit:import`. It resumes from its UID map without duplicating. |
| Live Preview doesn't work | §6 not done, or the wrong token selected | §6: environment `preview`, the preview token. The management token gets 401 on these settings, so it's a UI step. |
| `npm run kit:lytics` exits 2 about `SITE_URL` | `SITE_URL` is localhost or unset | Set it to the Launch address (§3), even before Launch exists. |
| `npm run kit:lytics` exits 3: "already has seeded profiles" | The account was seeded before; the local seed state is empty | Stop and ask. Restore `scripts/lytics/.state/seed-state.json` if the SE has it. Loading a second copy means the seeder's `--repin`: only with their explicit OK in the chat. Never `--resend` without the same. |
| `npm run kit:lytics` times out waiting for audiences or models | Lytics is still building | Re-run; finished steps are skipped. Models can take 30 minutes. |
| Counts differ from `docs/demo-script.md` | Expected: that table is the reference dataset | The SE's own numbers are in `expected`; `npm run kit:verify -- --counts` compares against them (±5%). |
| Personalize or reset exits 2 with 401 or error 105 | The session token expired (it lasts a few hours) | The SE runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal, then re-run. Nothing was half-done. |
| "Audience not in Personalize after 5 minutes" | Lytics isn't connected to the Personalize project, or the sync is slow | §8 (Integrations → Lytics, the same Lytics account), then re-run. |
| `npm run kit:personalize` exits 3 at "publish" | The base `hero_banner` has unpublished edits | The SE publishes or discards them in Contentstack, then re-run. |
| The site shows no content, or old content | Entries published to `preview` only, but the site reads another environment | Catch it in phase 1: `CONTENTSTACK_PUBLISH_ENVIRONMENTS=preview,<CONTENTSTACK_ENVIRONMENT>`. If the import already ran, a re-run skips publishes it already did, so the SE bulk-publishes the entries, assets and the hero entry variant to that environment in Contentstack, and sets the variable for later runs. |
| Launch shows old behavior after an env change | Launch reads env vars at build time | Redeploy. |
| Works locally, not on Launch | Launch runs `functions/[proxy].edge.js`, not `src/middleware.ts`; env differs | Check `HOSTING=launch`, `CONTENTSTACK_PERSONALIZATION`, the edge URL and the environment in Launch's variables; redeploy. |
| `red-panda-insights` tools missing or out of date | Not connected, or the 5-minute tool cache after a profile edit | `/mcp` → `red-panda-insights` → sign in or reconnect. `docs/mcp-profile.md` → *Fallbacks* if Profile Hub isn't available. |

## Brand Kit rejects the token

`npm run kit:brandkit` exits 2 with "Brand Kit API returned 401" (or 403). Nothing was changed. The Brand Kit APIs sometimes refuse the session token from `rp.mjs login` and need an OAuth user token for the organization instead. Follow §11.

- The SE gets an OAuth user token for the Brand Kit APIs in their organization (for example from a Contentstack Developer Hub app with OAuth and the Brand Kit scopes). Walk them through it one step at a time, but never ask for the token itself.
- They store it in the helper's credential store as `CONTENTSTACK_OAUTH_TOKEN`, never in `.env.local` or the chat. On a Mac: put the line `CONTENTSTACK_OAUTH_TOKEN=<token>` in a temporary file, run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs keys-import <that file>` in Terminal, and delete the file. Otherwise: add that line to `~/.red-panda/credentials.env`.
- Re-run `npm run kit:brandkit`. With the OAuth token stored, it sends `Authorization: Bearer <token>` (with `organization_uid` and `brand_kit_uid`) and no authtoken. `npm run kit:teardown` does the same for the Brand Kit.
- The login token stays where it was, so Personalize, `npm run kit:reset` and `npm run kit:teardown` keep working with it.
