import { DOMAIN } from "./catalog.mjs";

// Audiences the seed pre-builds. `commutingThreshold` is the native
// lytics_content.Commuting affinity cut-off, tuned from the loaded data.
const ROAM_URL = `${DOMAIN}/en/pdp/rp-roam`;

export function audiences({ commutingThreshold }) {
  const commuting = `lytics_content.Commuting >= ${commutingThreshold}`;
  return [
    {
      slug_name: "volt_owners_commuting",
      name: "Volt Owners × Commuting",
      description: "RP Volt owners with a commuting content affinity. Drives the Reliability and range homepage hero in Personalize.",
      is_public: true,
      segment_ql: `FILTER AND (products_owned INTERSECTS ("RP Volt"), ${commuting}) FROM user`,
    },
    {
      slug_name: "roam_preorder",
      name: "RP Roam Pre-orders",
      description: "Profiles with an RP Roam pre-order. Conversion audience for the 300 pre-order goal.",
      is_public: true,
      segment_ql: "FILTER EXISTS roam_preorder_ts FROM user",
    },
    {
      slug_name: "rp_seeded_not_preordered",
      name: "Red Panda Customers (not pre-ordered)",
      description: "Seeded profiles without a Roam pre-order. Source audience for the Roam lookalike model.",
      // Lookalike models need public (real-time graph) audiences; private ones fail with "Could not build seg graph".
      is_public: true,
      segment_ql: 'FILTER AND (seed_batch = "rp-demo-kit", NOT EXISTS roam_preorder_ts) FROM user',
    },
    {
      slug_name: "roam_intent",
      name: "RP Roam Intent",
      description: "Seeded profiles that viewed the RP Roam page in the last 90 days or pre-ordered. Target of the Roam intent lookalike (63 pre-orders alone are too few samples to train on).",
      is_public: true,
      segment_ql: `FILTER AND (seed_batch = "rp-demo-kit", OR (EXISTS urls_ts.\`${ROAM_URL}\`, EXISTS roam_preorder_ts)) FROM user`,
    },
    {
      slug_name: "rp_seeded_no_roam_intent",
      name: "Red Panda Customers (no Roam intent)",
      description: "Seeded profiles with no Roam page view and no pre-order. Source of the Roam intent lookalike.",
      is_public: true,
      segment_ql: `FILTER AND (seed_batch = "rp-demo-kit", NOT EXISTS urls_ts.\`${ROAM_URL}\`, NOT EXISTS roam_preorder_ts) FROM user`,
    },
  ];
}

// Read-only funnel audiences, created private so /sizes can count them. The first three are the
// Act 1 funnel (near Amsterdam → + RP Volt bought over a year ago → + commuting interest): the
// customer-insights skill counts them live with `rp.mjs lytics-audience-size <slug>`, because no
// read-only tool counts an unsaved definition. rp_check_* are internal checks it never names.
export const FUNNEL_CHECKS = [
  { slug_name: "near_amsterdam", name: "Customers near Amsterdam", segment_ql: "FILTER home_distance_km <= 80.5 FROM user" },
  {
    slug_name: "near_amsterdam_volt_owners",
    name: "Volt owners near Amsterdam (bought over a year ago)",
    segment_ql: 'FILTER AND (home_distance_km <= 80.5, product_purchase_ts.`RP Volt` < "now-1y") FROM user',
  },
  {
    slug_name: "near_amsterdam_volt_commuters",
    name: "Volt owners near Amsterdam who read about commuting",
    segment_ql: 'FILTER AND (home_distance_km <= 80.5, product_purchase_ts.`RP Volt` < "now-1y", lytics_content.Commuting >= 0.2) FROM user',
  },
  { slug_name: "rp_check_seeded", name: "RP check: seeded profiles", segment_ql: 'FILTER seed_batch = "rp-demo-kit" FROM user' },
  { slug_name: "rp_check_scored", name: "RP check: seeded with momentum score", segment_ql: 'FILTER AND (seed_batch = "rp-demo-kit", EXISTS score_momentum) FROM user' },
];

// Lookalikes learn what the target audience shares (behavioral scores +
// content affinities) and score everyone in the source audience.
export const LOOKALIKE_MODELS = [
  // The story's model. Lytics balances samples to the target, so 63
  // pre-orderers means 63 training samples: expect a low-confidence model.
  { name: "Roam Pre-order Lookalike", description: "Who looks like an RP Roam pre-orderer?", source: "rp_seeded_not_preordered", target: "roam_preorder" },
  // Same question with enough positives to train on: Roam page viewers + pre-orderers.
  { name: "Roam Intent Lookalike", description: "Who looks like someone researching or pre-ordering the RP Roam?", source: "rp_seeded_no_roam_intent", target: "roam_intent" },
];
