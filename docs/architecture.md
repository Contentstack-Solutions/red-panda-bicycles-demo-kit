# How the demo works

## Request flow

A browser asks for a page. On Contentstack Launch the request first reaches the edge function in `functions/[proxy].edge.js`. The function calls Personalize Edge, which works out which experience variant (if any) this visitor belongs to, based on the audiences Lytics has assigned them. The function passes that variant on to the site as the `x-personalize-variants` header and stores the visitor's state in the response. The site then asks the Contentstack Content Delivery API (CDA) for the page's entries, asking for the variant, and the CDA returns the personalized version of the entry, or the default one.

In parallel, the Lytics tag on every page sends page views and the sign-in identify call to Lytics. Lytics builds audiences from that data, and Personalize reads those audiences. When a visitor signs in as the persona, they join the audience `volt_owners_commuting` within a second or two, and the next request gets the hero variant.

## What each script writes

| Command | Writes to | What |
|---|---|---|
| `npm run kit:import` | Contentstack | Languages, environments, taxonomies, global fields, content types, assets, entries, publishes. Records old-to-new UIDs. |
| `npm run kit:lytics` | Lytics | Account settings, seeded profiles and events, audiences, lookalike models. Records your measured audience counts. |
| `npm run kit:personalize` | Personalize and Contentstack | Makes the audience public, creates and activates the experience, creates and publishes the hero entry variant, creates the four event keys. |
| `npm run kit:brandkit` | Brand Kit | Knowledge Vault items and the two voice profiles. |
| `npm run kit:reset` | Personalize and Lytics | Removes only audiences and experiences created since `--mark`, and their variants. |
| `npm run kit:teardown` | All of the above | Removes what the kit created, from the state file. |
| `npm run kit:doctor`, `kit:verify`, `kit:sweep` | nothing | Read-only checks. |

Every script that records progress writes `.kit/state.json` (git-ignored). Re-running a phase finishes what's missing. Lytics seeding also keeps its own record in `scripts/lytics/.state/seed-state.json`; don't delete it.
