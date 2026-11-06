# Tear down (full uninstall)

Removes what the kit's setup created from the SE's Contentstack, Personalize, Lytics and Brand Kit accounts, in reverse order, driven only by what `.kit/state.json` records as created.

## 1. Dry run

```
npm run kit:teardown
```

It prints the full ordered plan and any warnings, and changes nothing. Show the SE:

- **What will be deleted** (only what the kit created): Brand Kit voice profiles and Knowledge Vault items; entry variants (unpublished first), experiences, then leftover variant groups; event keys; entries (unpublished first), assets, asset folders, content types, global fields and taxonomies; environments and languages; Lytics audiences; and last, the Lytics `api_whitelist_fields` setting is put back to what the account had before setup.
- **What is left alone:** anything that was already in the accounts when setup ran (adopted environments, languages, audiences, experiences, event keys and Brand Kit items) is never deleted. It's listed as a manual step for the SE to do by hand if they want. So are the Brand Kit itself, the Personalize project, the Launch project and the stack.
- **What can't be removed:** Lytics profiles and events can't be deleted through the API, so the seeded profiles and their history stay in the Lytics account. That's why a dedicated sandbox Lytics account is recommended.
- **Warnings:** "these kit containers hold content the kit didn't create" means `--yes` would stop with exit 3 before deleting any container (content type or folder) that holds someone else's content.

## 2. Delete, only on the SE's OK

**First, the lookalike models.** If setup ran the Lytics model step, the dry run lists the two lookalike models under "By hand". Ask the SE to delete them in the Lytics UI before running `--yes`: Lytics may refuse to delete an audience a model still uses, and the kit can't delete models through the API.

Then:

```
npm run kit:teardown -- --yes
```

Each deletion is recorded in `.kit/state.json` (`tornDown`) as it happens. When every step is done, the state file moves to `.kit/state.torn-down-<time>.json`, so a fresh setup starts clean.

## When it fails

- **Exit 3, foreign content in a kit container:** nothing in that container was deleted. Show the SE the list; they move or delete that content themselves, then re-run `--yes`. Don't decide for them.
- **Lytics refuses to delete an audience a model uses:** delete the lookalike models first in the Lytics UI, then re-run.
- **Exit 2, authtoken missing or expired:** the SE runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal; re-run.
- **Exit 1 partway:** re-run `npm run kit:teardown -- --yes`. Finished steps are skipped, and it prints what's left.
- **A setup phase now exits 3, "torn-down setup":** the teardown didn't finish. Finish it with `--yes`, which archives the state, or the SE moves `.kit/state.json` aside themselves.
