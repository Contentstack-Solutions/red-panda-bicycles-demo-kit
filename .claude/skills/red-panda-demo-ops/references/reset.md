# Reset between demos

A demo run creates things live: in Act 1, Claude creates the **Roam Commuter Campaign** audience in Lytics; the SE may also make it public, build a Personalize experience for it or add variants. The reset removes the Lytics audiences and Personalize experiences created after a point in time (with the entry variants of those experiences), and leaves the kit's own objects alone.

**What the reset doesn't remove.** Tell the SE about these before the demo, and check for them after:

- **A variant added live to the kit's own experience** (**Homepage – Reliability and range**). The experience isn't new, so the reset keeps it, variant and all. To remove the variant by hand: in the stack, open the homepage's hero banner entry, then its entry variants, and unpublish and delete the variant's entry variant; then in Personalize, open the experience, remove the variant and save (activate) the new version. Leave **Volt Owners × Commuting** alone.
- **The Personalize copy of a live-created public audience.** Making a Lytics audience public syncs a copy into Personalize. The reset deletes the Lytics audience, but the copy can stay listed. A few minutes after the reset, open Personalize → **Audiences** and delete any copy of a deleted audience (for example **Roam Commuter Campaign**) that's still there.

## Before the demo: mark the start

```
npm run kit:reset -- --mark
```

It records the time as `lastMark` in `.kit/state.json` and changes nothing else. Without a mark, the reset needs `--since <ISO time>`.

## After the demo: list, review, delete

1. **List.** Nothing is deleted:

   ```
   npm run kit:reset
   ```

   It lists Lytics audiences and Personalize experiences created since the mark that aren't the kit's own. `-- --dry-run` does the same. Use `-- --since 2026-11-05T09:00:00Z` to pick another start time.
2. **Review with the SE.** Show the list. It should hold only what the demo created, such as `roam_commuter_campaign`. Objects with no creation time are listed for the SE to check by hand and are never deleted. If anything on the list should stay, don't run `--yes`: the SE deletes the rest by hand, or you use a later `--since`.
3. **Delete**, only after the SE says yes:

   ```
   npm run kit:reset -- --yes
   ```

   Order: for each experience, its entry variants are unpublished and deleted, then the experience; then the Lytics audiences. It publishes and unpublishes in `CONTENTSTACK_PUBLISH_ENVIRONMENTS` (else `CONTENTSTACK_ENVIRONMENT`, else `preview`).
4. **Re-check:** `npm run kit:verify`. The persona should still be in `volt_owners_commuting` and the counts within ±5%.

## When it fails

- **Exit 2, "No --since given and no mark recorded":** run `npm run kit:reset -- --mark` before the next demo; for now pass `-- --since <ISO>`.
- **Exit 2, authtoken missing or expired (401, error 105):** the SE runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal; re-run.
- **Exit 1 partway:** re-run the same command; what's already deleted is skipped.
