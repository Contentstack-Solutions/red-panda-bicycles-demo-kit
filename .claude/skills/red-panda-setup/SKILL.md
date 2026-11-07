---
name: red-panda-setup
description: Guided first-time setup of the Red Panda demo kit (this repo) in your own Contentstack, Lytics and Launch accounts, resuming where you left off. Use it only for installing the kit itself - "set up the Red Panda demo kit", "set up the Red Panda demo", "install the Red Panda demo kit", "resume the kit setup", "continue the Red Panda demo setup", "what's left of the kit setup?" - for the kit's setup phases (.env.local keys, RP Commerce, kit:import, kit:lytics, kit:personalize, kit:brandkit, the Launch deploy, connecting Red Panda Insights in Profile Hub), or when npm run kit:doctor, kit:import, kit:lytics, kit:personalize or kit:brandkit fails. Never use it to set up personalization, an experience, a variant or an audience for customers (that is red-panda-customer-insights), and not for resetting or tearing down a set-up copy (red-panda-demo-ops).
---

# Red Panda demo kit: setup

You walk a solutions engineer (SE) through setting up this repo's demo in their own accounts. The scripts do the work. Your job is to run them in order, stop at the steps only a person can do, and send the SE to the right section of `docs/manual-steps.md`. That file is the single source for every UI step: link to its sections, don't copy them into the chat.

Keep each message short: what's done, what you're running next, or the one thing the SE has to do now.

## Rules

- **Never ask the SE to paste a token or password into the chat, and never print one.** Tokens go into `.env.local` in their editor. The Contentstack session token comes from `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login`, which the SE runs in their own Terminal (it asks for a password and 2FA code). If someone pastes a token into the chat anyway, don't repeat it, and suggest rotating it.
- **Don't open, `cat` or grep `.env.local`.** It holds tokens. Use `npm run kit:doctor` to see what's set or missing. To set a non-secret value the SE gives you (such as `SITE_URL` or `DEMO_PERSONA_EMAIL`), use the setter in `references/phases.md`.
- **Never pass `--repin` or `--resend`** (Lytics seeder flags), unless the SE has said in the chat that they want exactly that. The kit scripts never pass them on their own.
- **Exit code 3 means stop and ask.** A person has to decide, and nothing was changed. Quote the message and its hint in one or two lines, then ask the SE what they want. Don't pick for them, and don't move or delete state files to get past it.
- **Never delete `scripts/lytics/.state/seed-state.json`** or `.kit/state.json`. They're the only record of what was sent and created.
- Run every kit command from the repo root, written exactly as shown (`npm run kit:<name> -- <flags>`), so it matches the project's saved permissions.

Exit codes are the same for every kit script: **0** ok, go on · **1** error: read the output, fix the cause, re-run (finished work is skipped) · **2** missing input or credential: pass on the hint (a value in `.env.local`, or `rp.mjs login` in Terminal) · **3** a person's decision, nothing changed: stop and ask.

## Start here: resume

1. Read `.kit/state.json` with the Read tool (it holds no secrets). It may not exist yet; then nothing is done.
2. If `tornDown` has entries, this state belongs to a torn-down setup and every setup phase will exit 3. Tell the SE and ask whether to finish the teardown (`npm run kit:teardown -- --yes`, which archives the state; see the `red-panda-demo-ops` skill) or to move `.kit/state.json` aside themselves. Wait for the answer.
3. Report which phases are done, in one short list, using the "Done when" column below. Phases with no state key (0, 1, 2, 6, 7, 8) count as done only when their check passes now; run those checks, they're read-only.
4. Start at the first phase that isn't done. Before running a phase's command, run its doctor check.

## Phases

Do them in this order. Details, flags and failure handling for each: `references/phases.md`. Where each manual step lives: `references/manual-steps.md`.

| # | Phase | Check | Command | Done when | Manual steps (`docs/manual-steps.md`) |
|---|---|---|---|---|---|
| 0 | Prereqs | `node -v` (20.6 or newer) | `npm ci` | `npm ci` exits 0 | none |
| 1 | Keys | `npm run kit:doctor -- --phase keys` | (fill `.env.local`) | doctor exits 0 | §1 stack (master language English, `en`), §2 tokens, §3 Launch project name → `SITE_URL`, §7 Lytics token, account ID and persona email |
| 2 | Commerce (optional) | `npm run kit:doctor -- --phase commerce` | none | doctor exits 0 (warnings are fine) | §4 RP Commerce, only if the SE has access |
| 3 | Contentstack | `npm run kit:doctor -- --phase contentstack` | `npm run kit:import`, or `npm run kit:import -- --without-commerce` when RP Commerce isn't installed | `phases.contentstack.done` | §5 optional apps, §6 Live Preview (after the import) |
| 4 | Lytics | `npm run kit:doctor -- --phase lytics` | `npm run kit:lytics` | `phases.lytics.done` and `expected` | none (§7 was done in phase 1) |
| 5 | Personalize | `npm run kit:doctor -- --phase personalize` | `npm run kit:personalize` | `phases.personalize.done` | §8 project + Lytics, §9 login, then §12 goals |
| 5b | Brand Kit | `npm run kit:doctor -- --phase brandkit` | `npm run kit:brandkit` | `phases.brandkit.done` | §10 Brand Kit; §11 only on 401/403 |
| 6 | Run | `npm run kit:doctor -- --phase site` | `npm run dev`, then Launch | `npm run kit:verify -- --site <url>` passes, locally then on Launch | §13 Launch |
| 7 | Verify | `npm run kit:verify` | `npm run kit:verify -- --counts` | "All checks passed." | none |
| 8 | Presenter | `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs doctor` | `claude mcp add …` (from Profile Hub, in Terminal) | `/mcp` shows `red-panda-insights` connected | §14 → `docs/mcp-profile.md` |

When a phase needs a manual step, send the SE to that section, say what to tell you when it's done, and wait. Then re-run the check.

## Things that trip people up

- **RP Commerce is optional.** Ask the SE once, in phase 2, whether they have access to it. Without it, the import needs `--without-commerce` (the SE's choice: it can't be switched to the app later in the same stack); without the flag it exits 3 and changes nothing.
- **The stack's master language must be English (`en`).** It can't be changed later, and `npm run kit:import` exits 2 on any other. Catch it in phase 1.
- **`SITE_URL` must be the Launch address before phase 4**, even though Launch is set up in phase 6. `npm run kit:lytics` exits 2 when it's localhost. Pick the Launch project name in phase 1.
- **The setup publishes to `CONTENTSTACK_PUBLISH_ENVIRONMENTS`** (else `CONTENTSTACK_ENVIRONMENT`, else `preview`). Make sure it includes the environment the site reads.
- **The session token expires after a few hours.** On a 401 (or Contentstack error 105), the SE runs `rp.mjs login` in Terminal again, then you re-run the same command.

More symptoms and fixes: `references/troubleshooting.md`.

## When setup is finished

Say so in one line, then point the SE to `docs/demo-script.md` and to the `red-panda-demo-ops` skill for the before- and after-demo routine (`npm run kit:reset -- --mark`, the journey check, the reset).
