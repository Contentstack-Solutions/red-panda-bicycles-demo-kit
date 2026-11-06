# Demo script

For a solutions engineer showing Red Panda Bicycles to a prospect. The demo has two acts and one optional beat. Act 1 asks Claude questions about the customer data. Act 2 shows the site changing for one customer.

Red Panda is a bike brand with two e-bikes: the RP Volt, which has been on sale for years, and the new RP Roam, open for pre-orders. The persona is **Sam Parker**, a long-time RP Volt owner who commutes by bike.

## Before the demo

1. Check everything works:

   ```
   npm run kit:verify
   ```

   Every line should pass. Add `-- --site <url>` to check a deployed site.
2. See your own audience counts: `npm run kit:verify -- --counts`. The numbers below are approximate, from the reference dataset. Yours will differ, and that's fine as long as they match this output.
3. If your Contentstack sign-in is older than a few hours, run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal.
4. Mark the start point, so the reset afterward knows what the demo created:

   ```
   npm run kit:reset -- --mark
   ```
5. Open Claude Code in this repo with the `red-panda-insights` connection signed in ([mcp-profile.md](mcp-profile.md)).
6. Open the site in a private window, signed out.

## Act 1: ask Claude about your customers

Type each prompt as written. Claude answers from live Lytics data. The "Expected" column is approximate, from the reference dataset; your own numbers are printed by `npm run kit:verify -- --counts`. In that output, the `q1`, `q2` and `q3` rows are the answers to questions 1, 2 and 3 (the saved audiences `near_amsterdam`, `near_amsterdam_volt_owners` and `near_amsterdam_volt_commuters`, which Claude counts live), and `roam_preorder` is question 8; question 4's audience is created live through the helper (`rp.mjs`), so it has no row.

| # | Ask | Expected | What it's doing |
|---|---|---|---|
| 1 | "How many of our customers live within 50 miles of Amsterdam?" | About 17,900 | Home distance of 80.5 km or less. It uses each customer's home location, not the IP address. |
| 2 | "Of those, how many bought our first e-bike, the RP Volt, more than a year ago?" | About 4,980 | RP Volt purchase date older than one year. |
| 3 | "Narrow that to people who've shown interest in our commuting content." | About 3,540 | Commuting content affinity of 0.2 or more. A cut-off of 0.3 gives about 3,000. |
| 4 | "Create an audience from that and call it Roam Commuter Campaign." | A new audience | Live step. Claude creates `roam_commuter_campaign` in Lytics. |
| 5 | "What accessories does this audience buy most often?" | Saddlebags about 53%, U-lock 42%, pannier 32% | True inside this audience only. Across all customers, the U-lock leads. |
| 6 | "What content have our e-bike owners been reading lately?" | Battery, Range, Commuting, City | Content affinities from Lytics. |
| 7 | "Who looks most like the people researching or pre-ordering the new Roam?" | Roam Intent Lookalike | Drivers: momentum, propensity, consistency; E-Bikes, City, Range. |
| 8 | "How many Roam pre-orders do we have so far?" | Your count from `kit:verify -- --counts` (about 63 in the reference data) | The `roam_preorder` audience. |

Step 4 changes your Lytics account. `npm run kit:reset -- --yes` removes the audience afterward (see "After the demo").

## Act 2: the site changes for Sam

1. On the site, open the homepage signed out. Point out the default hero.
2. Sign in as Sam: use the member sign-in, choose **Sign in with Google**, then **Continue**. The site signs in as Sam Parker with the email in `DEMO_PERSONA_EMAIL`.
3. After "Signing you in..." the homepage hero changes to the **Reliability and Range** variant: "For riders who've put in the miles", "Reliability and Range Above All.", "Meet the Roam".
4. Explain: Sam is a long-time Volt owner who reads commuting content, so Lytics put Sam in the `volt_owners_commuting` audience, and Personalize served the hero written for that audience. Nobody changed the page. It's the same entry with a variant.

If the hero doesn't change, run `npm run kit:verify` and read the failing line.

## Optional: write it in the brand's voice

Shows the Brand Kit. In Claude Code, ask:

> "Draft a headline and one-line description for the Roam hero, written in the voice of *The Long Ride*, using our Brand Kit."

Claude reads the Knowledge Vault and drafts the copy in that voice. Compare it with the variant on the site.

## After the demo

1. List what the demo created. Nothing is deleted yet:

   ```
   npm run kit:reset
   ```
2. Read the list. It should show the `roam_commuter_campaign` audience and anything else you created live. Objects with no creation time are listed for you to check and are never deleted.
3. Delete them:

   ```
   npm run kit:reset -- --yes
   ```
4. Run `npm run kit:verify` once more to confirm the demo is ready for next time.

To remove the whole kit from your accounts, see `npm run kit:teardown`.
