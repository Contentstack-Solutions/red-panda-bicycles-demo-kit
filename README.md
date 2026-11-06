# Red Panda Demo Kit

A complete, runnable copy of the Red Panda Bicycles demo for solutions engineers (SEs). It has the storefront (Next.js on Contentstack CMS, Personalize, Launch and Brand Kit, with Lytics for customer data) and the scripts that fill empty accounts with the content, customers, audiences and personalization the demo shows.

You end with your own Red Panda site live on Contentstack Launch, a seeded Lytics account, a personalized homepage hero for the demo persona, and Claude connected to your data for the live Q&A part of the demo.

## Quick start

Give Claude Code this repo's link and say:

> Set up the Red Panda demo kit from this repo.

Claude takes it from there, using the steps in [For AI agents](#for-ai-agents) below. It runs the setup scripts and stops only for the steps that need you in a browser, such as creating a stack or copying a token. If you stop partway, say "resume the kit setup" later and it picks up where it left off.

Or start it yourself:

```bash
gh repo create my-red-panda-demo --template Contentstack-Solutions/red-panda-demo-kit --private --clone
```

```bash
cd my-red-panda-demo && npm ci
```

Then open Claude Code in that folder and say "set up the Red Panda demo kit".

## What you need

- **Node 20.6 or newer**, **[Claude Code](https://claude.com/claude-code)**, and the **[GitHub CLI](https://cli.github.com)** signed in (`gh auth login`).
- **A GitHub account.** Launch deploys from your own GitHub copy of this repo, so you make one first.
- **A Contentstack organization** with Personalize, Launch, Brand Kit and the Profile Hub app.
- **An empty stack whose master language is English (`en`).** The master language can't be changed later. You create it during setup.
- **Access to the RP Commerce marketplace app and its store.** Arrange this with the app's owner before you start.
- **A Lytics account**, ideally a dedicated sandbox. Lytics profiles and events can't be deleted through the API, so tear-down can't remove them.

Your keys live in `.env.local`, which is git-ignored. Never commit it, and never paste its contents into the chat.

## For AI agents

If a user gave you this repo's link and asked you to set it up, follow these steps in order.

1. **Make the user's own copy.** Launch deploys from a GitHub repo the user owns, so a plain clone isn't enough. Ask what to call the repo (suggest `my-red-panda-demo`), then run this. The template is `Contentstack-Solutions/red-panda-demo-kit`; if you were given a link to a different copy, use that one's `<owner>/<repo>` instead:

   ```bash
   gh repo create <name> --template Contentstack-Solutions/red-panda-demo-kit --private --clone
   ```

   If `gh` isn't installed or signed in, ask the user to run `gh auth login` in their Terminal and tell you when it's done. If they can't use `gh`, clone the repo, have them create an empty GitHub repo, and point `origin` at it before the Launch phase.
2. **Install:** `cd <name> && npm ci`.
3. **Restart in the copy.** The setup skill (`.claude/skills/red-panda-setup/`), the saved permissions (`.claude/settings.json`) and the project instructions (`CLAUDE.md`) load only when Claude Code starts in that folder. If your session started anywhere else, ask the user to open Claude Code in the new folder and say "set up the Red Panda demo kit" there. If they'd rather not, read `.claude/skills/red-panda-setup/SKILL.md` and follow it exactly.
4. **Run the setup skill to the end.** It works through phases 0–8 below. It resumes from `.kit/state.json` if the user comes back later.
5. **Done when** `npm run kit:verify -- --site <Launch URL>` and `npm run kit:verify -- --counts` both pass, and `/mcp` shows `red-panda-insights` connected.

Rules that hold throughout:

- Never ask for a token or password in the chat, and never print one. Tokens go into `.env.local`, which the user edits.
- Don't open, `cat` or grep `.env.local`. Use `npm run kit:doctor` to see what's set or missing.
- Exit code 3 means a person has to decide and nothing changed. Stop and ask.
- Never delete `.kit/state.json` or `scripts/lytics/.state/seed-state.json`. They're the only record of what setup created and sent.

## What setup does

Every step in a browser that the scripts can't do is in [docs/manual-steps.md](docs/manual-steps.md). The setup skill sends you to the right section when it's time.

| # | Phase | What happens | Command |
|---|---|---|---|
| 0 | Prereqs | Install dependencies | `npm ci` |
| 1 | Keys | Create the stack and tokens, fill `.env.local`, check it | `npm run kit:doctor -- --phase keys` |
| 2 | Commerce | Install RP Commerce, check it | `npm run kit:doctor -- --phase commerce` |
| 3 | Contentstack | Import content types, entries, assets and locales | `npm run kit:import` |
| 4 | Lytics | Seed customers, events, audiences and models | `npm run kit:lytics` |
| 5 | Personalize | Create the homepage experience and its variant | `npm run kit:personalize` |
| 5b | Brand Kit | Create vault items and voice profiles | `npm run kit:brandkit` |
| 6 | Run and deploy | Check the site locally, then deploy your GitHub copy on Launch | `npm run dev`, then [§13](docs/manual-steps.md#13-create-the-launch-project-and-deploy) |
| 7 | Verify | Check the persona's journey and the audience counts | `npm run kit:verify -- --counts` |
| 8 | Presenter | Connect the `Red Panda Insights` profile ([docs/mcp-profile.md](docs/mcp-profile.md)) | `claude mcp add …` |

Every kit script exits 0 when it's ok, 1 on an error (re-run it; finished work is skipped), 2 when something is missing (a credential or a setting), and 3 when a person has to decide, with nothing changed.

## Before and after each demo

The demo script is [docs/demo-script.md](docs/demo-script.md). The `red-panda-demo-ops` skill walks you through both routines.

Before:

```bash
npm run kit:verify
```

```bash
npm run kit:reset -- --mark
```

After:

```bash
npm run kit:reset
```

```bash
npm run kit:reset -- --yes
```

The first reset command only lists the audiences and experiences created since the mark. Check the list, then run it again with `--yes` to delete them.

## Tear-down

Removes what setup created from your accounts. It's a dry run unless you add `--yes`:

```bash
npm run kit:teardown
```

```bash
npm run kit:teardown -- --yes
```

Only objects that setup created (recorded in `.kit/state.json`) are removed. Anything that was already there is left alone and listed as a manual step. Lytics profiles and events stay behind.

## More

- [docs/manual-steps.md](docs/manual-steps.md): every step in a browser
- [docs/demo-script.md](docs/demo-script.md): the demo itself
- [docs/mcp-profile.md](docs/mcp-profile.md): connecting Claude to your data through Profile Hub
- [docs/architecture.md](docs/architecture.md): how the pieces fit
- [docs/maintainers.md](docs/maintainers.md): refreshing the content, the leak check, tests and publishing

```
.claude/skills/
  red-panda-setup/               guided setup
  red-panda-demo-ops/            reset, journey check, tear-down
  red-panda-customer-insights/   Claude's live Lytics and Personalize helper (rp.mjs)
docs/                            manual steps, demo script, architecture, MCP profile
scripts/kit/                     the kit:* commands
scripts/lytics/                  customer and event seeder
seed/                            Contentstack, Lytics, Personalize and Brand Kit data
src/                             the Next.js site
functions/                       Launch edge function
```
