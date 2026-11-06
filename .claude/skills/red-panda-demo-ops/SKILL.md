---
name: red-panda-demo-ops
description: Day-to-day operation of a set-up Red Panda Bicycles demo kit. Use it for "before the demo", "after the demo", "get ready for the demo", "reset the demo", "clean up after the demo", "mark the start", "journey check", "check the persona sign-in", "the hero didn't change", "tear down", "uninstall", "remove the kit from my accounts", and for npm run kit:reset, kit:teardown or kit:verify questions and failures. Not for first-time setup or resuming setup (red-panda-setup) or for questions about Red Panda's customers (red-panda-customer-insights).
---

# Red Panda demo kit: operations

You help a solutions engineer (SE) run their copy of the demo: get ready before a demo, clean up after it, check the persona's sign-in journey, and remove the kit entirely. The script for the demo itself is `docs/demo-script.md`.

## Rules

- **Nothing is deleted without the SE's OK in the chat.** `npm run kit:reset` and `npm run kit:teardown` list first and change nothing. Show the SE what they list, and run them with `--yes` only after the SE says yes to that list.
- **Never ask for a token or password, and never print one.** If the Contentstack session token has expired (exit 2, a 401 or error 105), the SE runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in their own Terminal; then re-run the same command.
- **Exit code 3 means stop and ask.** Nothing was changed. Quote the message and hint, and let the SE decide.
- **Never delete `scripts/lytics/.state/seed-state.json`** or move `.kit/state.json` yourself.
- Run kit commands from the repo root exactly as shown (`npm run kit:<name> -- <flags>`).

Exit codes: 0 ok · 1 error (read it, fix, re-run; finished work is skipped) · 2 missing input or credential (pass on the hint) · 3 a person's decision, nothing changed.

## Before a demo

1. `npm run kit:verify`. Every line should pass. If one fails, see `references/journey-check.md` → *Troubleshooting*.
2. `npm run kit:verify -- --counts` shows this account's own audience counts. In that table `q1`, `q2` and `q3` answer Act 1 questions 1–3 and `roam_preorder` answers question 8 (`docs/demo-script.md`).
3. Run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs doctor` and check that Personalize is ready (`ready.personalize_write` is true). If it isn't, the SE runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal; then run doctor again.
4. `npm run kit:reset -- --mark` records the start point, so the reset afterwards knows what the demo created.
5. Offer the browser journey check: `references/journey-check.md`.
6. Remind the SE to start a fresh Claude Code session with `red-panda-insights` connected (`/mcp`), so earlier questions don't carry into Act 1.

## After a demo

Reset, in three steps (details: `references/reset.md`):

1. `npm run kit:reset` lists the audiences and experiences created since the mark. Nothing is deleted.
2. Show the SE the list and ask whether to delete it.
3. On a yes, `npm run kit:reset -- --yes`. Then `npm run kit:verify` to confirm the demo is ready for next time.

## Journey check

Proves the persona's sign-in changes the homepage hero, in a real browser, locally and then on Launch. Always run `npm run kit:verify` first. Steps and the troubleshooting table: `references/journey-check.md`.

## Tear down (uninstall)

Removes what setup created from the SE's accounts, from `.kit/state.json`. Anything that was already there (adopted) is left alone and listed as a manual step. Dry run first, then `--yes` only on the SE's OK. Details and what stays behind: `references/teardown.md`.
