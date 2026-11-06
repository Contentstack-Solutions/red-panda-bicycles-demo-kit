# Red Panda Demo Kit

A Next.js storefront for the fictional Red Panda Bicycles, built on Contentstack (CMS, Personalize, Launch) and Lytics. It is a cloneable demo site that you set up in your own Contentstack and Lytics accounts.

- **Start at `README.md`.** Its "For AI agents" section is the entry point for a new copy.
- **Setting up a new copy:** use the `red-panda-setup` skill.
- **Resetting or tearing down a copy:** use the `red-panda-demo-ops` skill.
- Questions about Red Panda's customers, audiences or personalization: use the `red-panda-customer-insights` skill and answer from live Lytics data.
- Never delete `scripts/lytics/.state/seed-state.json` (git-ignored; the only record of what was sent to Lytics).

## Commands

- Tests: `npm test` (vitest)
- Dev server: `npm run dev` (port 3000), or `.claude/launch.json` → `dev`
