# Lytics reference: Red Panda Bicycles

This file tells you where to look, not what you'll find. Measure every count, percentage, topic and model score live.

The Lytics account and its IDs come from tool results (`get_accounts`, or the helper's output); don't assume them.

## Audiences

Find an audience by its slug (`lytics_get_all_audiences`, or the helper's `lytics-audiences`); read its ID from the result when a tool needs one.

| Slug | What it is |
|---|---|
| `roam_preorder` | Everyone with an RP Roam pre-order (`EXISTS roam_preorder_ts`); goal 300 |
| `roam_intent` | People who viewed the RP Roam page or pre-ordered; the lookalike's target |
| `volt_owners_commuting` | RP Volt owners with commuting interest |
| `near_amsterdam` | Customers whose home is within 50 miles (80.5 km) of Amsterdam |
| `near_amsterdam_volt_owners` | … who bought the RP Volt more than a year ago |
| `near_amsterdam_volt_commuters` | … who also have commuting interest (`lytics_content.Commuting >= 0.2`) |

Count any of these live with `lytics-audience-size <slug>`. A definition with no saved audience can't be counted live without saving it: see *Saved funnel audiences* in SKILL.md.

## Useful fields

| Field | Type | Notes |
|---|---|---|
| `home_distance_km` | number | Distance from home to Amsterdam Centraal, from the CRM |
| `products_owned` | []string | Bikes (not accessories) |
| `product_purchase_ts` | map[string]time | First purchase time by product name |
| `accessories_owned` | []string | Touring Saddlebag, Red Panda Fortress U-Lock, Red Panda Commuter Pannier 20L, Beacon 1200 Front Light, Tail Glow Rear Light, Aero Road Helmet, Trail Guard MTB Helmet, Explorer Frame Bag |
| `lytics_content` | map[string]number | Native topic affinities: Commuting, Battery, Range, Warranty, Exploration, City, E-Bikes, Roam, Accessories, Stories (plus auto-extracted noise terms) |
| `roam_preorder_ts` | date | Set when someone pre-orders the Roam |
| `segment_prediction` | map | Lookalike scores by model name |
| `score_momentum`, `score_propensity`, … | number | Native behavioral scores |

## Lookalike models

| Model | Recommend? |
|---|---|
| Roam Intent Lookalike | **Yes** |
| Roam Pre-order Lookalike | No: too few pre-orders to train on |

No connected tool lists the models or reads their summaries. Quote health, sample counts or drivers only if a tool result gave them to you.

## Reading and writing

Read through the `Red Panda Insights` tools. They're read-only, so every change and every live count goes through the helper (`node .claude/skills/red-panda-customer-insights/scripts/rp.mjs …`), which holds the admin token itself.

| Need | Helper command |
|---|---|
| List audiences (slug, ID, public) | `lytics-audiences` (`lytics_get_all_audiences` can too) |
| One audience's definition | `lytics-audience <slug>` |
| Live count of a saved audience | `lytics-audience-size <slug>` |
| A profile | `lytics-profile _uids seed-sam`, or `lytics-profile <field> <value>` (`get_a_user_profile` can too) |
| Create an audience | `lytics-create-audience` with `{"name", "segment_ql", "is_public"}` |
| Change an audience (for example, make it public) | `lytics-update-audience` with `{"audience", …changes}` |
| Delete an audience | `lytics-delete-audience <slug>` |
| Send data to a profile | `lytics-send <stream>` with the record as the body |

Never count with `POST /api/segment/count`: it saves an unnamed audience. Never present cached field stats (`get_field_information`) as a live count.
