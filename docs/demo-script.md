# Demo script

For a solutions engineer showing Red Panda Bicycles to a prospect. The demo opens with the story, then has two acts. In Act 1 you find an audience by asking Claude about live customer data. In Act 2 you show the site changing for one customer from that audience. **Say** lines are talking points; put them in your own words.

## The story in 30 seconds

- You're a marketer at **Red Panda Bicycles**, an Amsterdam bike brand known for regular, unpowered bikes.
- Its first e-bike, the **RP Volt**, never took off. Owners complained about the battery.
- The new **RP Roam** fixes that: more range, built to last. It's open for pre-orders.
- **Your goal: 300 pre-orders** to fund the first manufacturing run. You're at about 63.
- **The problem:** buyers research e-bikes with AI assistants, and the assistants recommend competitors for commuting because of the Volt's short range.
- **The plan:** find existing customers who care most about range (Volt owners who commute) and win them back with a page built for them.

## Before the demo

1. Check everything works. Every line should pass; add `-- --site <url>` to check the deployed site.

   ```bash
   npm run kit:verify
   ```
2. Get your own audience counts. The numbers below are approximate, from the reference dataset; yours will differ, and that's fine as long as they match this output.

   ```bash
   npm run kit:verify -- --counts
   ```
3. If your Contentstack sign-in is older than a few hours, run `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal.
4. Mark the start point, so the reset afterwards knows what the demo created:

   ```bash
   npm run kit:reset -- --mark
   ```
5. Open Claude Code in this repo with the `red-panda-insights` connection signed in ([mcp-profile.md](mcp-profile.md)).
6. Open the site in a private window, signed out.

## Opening: the problem (1 minute)

- **Say:** "Buyers don't start on our website any more. They ask an AI assistant which e-bike to buy."
- **Say:** "Ask one for the best e-bike for commuting and our competitors come up. We're left out, because the Volt's range is short."
- **Say:** "So the Roam's story writes itself: range and reliability. The question is who to tell first."
- **Optional:** if you can show Canoe, Contentstack's AI visibility tool, run the prompt "best e-bikes for commuting" there instead of telling it.

## Act 1: find the audience with Claude

- **Say:** "Our customer data is in Lytics, and Claude is connected to it. I don't log in to Lytics; I ask questions the way I'd ask a colleague."
- Type each prompt as written. Claude answers from live Lytics data.

| # | Ask | Expected | Point to make |
|---|---|---|---|
| 1 | "How many of our customers live within 50 miles of Amsterdam?" | About 17,900 | Each customer's home location (within 80.5 km), not the IP address. |
| 2 | "Of those, how many bought our first e-bike, the RP Volt, more than a year ago?" | About 4,980 | Purchase history: these are the people the Volt let down. |
| 3 | "Narrow that to people who've shown interest in our commuting content." | About 3,540 | Behaviour: Lytics scores what each person reads (commuting affinity 0.2 or more; 0.3 gives about 3,000). |
| 4 | "Create an audience from that and call it Roam Commuter Campaign." | A new audience | Live step: Claude creates `roam_commuter_campaign` in Lytics. The marketer built it, with no ticket to a data team. |
| 5 | "What accessories does this audience buy most often?" | Saddlebags about 53%, U-lock 42%, pannier 32% | An offer idea: longer rides mean saddlebags. Across all customers the U-lock leads, so this is specific to the audience. |
| 6 | "What content have our e-bike owners been reading lately?" | Battery, Range, Commuting, City | Confirms the angle: they're reading about battery and range. |
| 7 | "Who looks most like the people researching or pre-ordering the new Roam?" | Roam Intent Lookalike | A lookalike model finds the next people to target. Drivers: momentum, propensity, consistency; E-Bikes, City, Range. |
| 8 | "How many Roam pre-orders do we have so far?" | Your count from `kit:verify -- --counts` (about 63 in the reference data) | Where we stand against the 300 goal. |

- **Land it:** "In a few minutes I've validated the angle, found about 3,500 people to target, built the audience and found an offer idea. I never left Claude."

In the `--counts` output, the `q1`, `q2` and `q3` rows are the answers to questions 1, 2 and 3 (the saved audiences `near_amsterdam`, `near_amsterdam_volt_owners` and `near_amsterdam_volt_commuters`, which Claude counts live), and `roam_preorder` is question 8. Question 4's audience is created live, so it has no row. Step 4 changes your Lytics account; the reset removes it afterwards.

## Act 2: Sam's experience

**Meet Sam Parker.** She's one of the people Act 1 found.

- Bought the RP Volt in 2021. The battery was dead by year two, after 3 service tickets.
- Left a 2-star review: "Love the shop, battery died by year two."
- Still commutes on a Red Panda city bike, and belongs to the Amsterdam Bike Club.
- Test-rode the new Roam at a club demo ride, and has been reading about battery myths, commuting and the warranty.
- **Say:** "Sam isn't a lost customer. She's a disappointed one."

**Show it:**

1. Open the homepage signed out. **Say:** "This is what everyone sees."
2. Sign in as Sam: use the member sign-in, choose **Sign in with Google**, then **Continue**. The site signs in with the email in `DEMO_PERSONA_EMAIL`.
3. After "Signing you in..." the hero changes to **"Reliability and Range Above All."**, with "For riders who've put in the miles" and a **Meet the Roam** button.
4. **Say:** "It leads with the two things Sam has been checking: the battery, and her commute. Lytics knows she's a Volt owner who reads commuting content, so she's in the Volt owners × commuting audience, and Personalize served the hero written for it."
5. **Say:** "Nobody built a new page. It's the same homepage entry with a variant, and a marketer made it."

If the hero doesn't change, run `npm run kit:verify` and read the failing line.

**Optional: the day trip.** Open the blog article "A Good Day Out Around Amsterdam" and use the Trip Planner at the bottom. Pick a farther destination; the planner recommends a bike for the distance. **Say:** "Destinations that felt out of reach are a day trip on the Roam, and every choice she makes tells us more about her."

**Optional: the brand's voice.** In Claude Code, ask:

> "Draft a headline and one-line description for the Roam hero, written in the voice of *The Long Ride*, using our Brand Kit."

**Say:** "Claude read our Brand Kit, so new copy sounds like us." Compare the draft with the hero on the site.

## Close

- **The angle:** AI assistants told us our range was the problem, so the Roam leads with range.
- **The audience:** the marketer found it by asking questions, and built it herself.
- **The experience:** Sam got a homepage written for her, from a variant of the same entry.
- **The point:** the marketer made every decision. Claude, Lytics and Personalize did the work in between.

## Not in this kit

Don't promise these; the kit doesn't build them yet:

- The Roam pre-order checkout with trade-in credit for the Volt (the moment the pre-order count goes up by one).
- A personalized Roam product page.
- Agents that edit pages for you or post each pre-order to Slack.

## After the demo

1. List what the demo created. Nothing is deleted yet:

   ```bash
   npm run kit:reset
   ```
2. Read the list. It should show the `roam_commuter_campaign` audience and anything else you created live. Objects with no creation time are listed for you to check and are never deleted.
3. Delete them:

   ```bash
   npm run kit:reset -- --yes
   ```
4. Run `npm run kit:verify` once more to confirm the demo is ready for next time.

To remove the whole kit from your accounts, see `npm run kit:teardown`.
