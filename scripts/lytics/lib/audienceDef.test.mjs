import { describe, expect, it } from "vitest";
import { FUNNEL_CHECKS, audiences } from "./audienceDef.mjs";

const OLD_PREFIX = "z".repeat(2);
const OLD_BATCH = ["key", "note"].join("");

const all = [...audiences({ commutingThreshold: 0.2 }), ...FUNNEL_CHECKS];

describe("audienceDef", () => {
  it("has no legacy-prefixed slugs, legacy batch values or backup audience", () => {
    for (const a of all) {
      expect(a.slug_name.startsWith(`${OLD_PREFIX}_`)).toBe(false);
      expect(a.name.toLowerCase().startsWith(OLD_PREFIX)).toBe(false);
      expect(a.segment_ql).not.toContain(OLD_BATCH);
    }
    expect(all.some((a) => a.slug_name.includes("backup"))).toBe(false);
  });

  it("keeps the shared audience slugs", () => {
    const slugs = audiences({ commutingThreshold: 0.2 }).map((a) => a.slug_name);
    expect(slugs).toEqual(["volt_owners_commuting", "roam_preorder", "rp_seeded_not_preordered", "roam_intent", "rp_seeded_no_roam_intent"]);
  });

  it("defines the funnel audiences (Act 1 Q1–Q3) and the rp_check_* internal checks", () => {
    const bySlug = Object.fromEntries(FUNNEL_CHECKS.map((c) => [c.slug_name, c]));
    expect(Object.keys(bySlug)).toEqual(["near_amsterdam", "near_amsterdam_volt_owners", "near_amsterdam_volt_commuters", "rp_check_seeded", "rp_check_scored"]);
    expect(bySlug.near_amsterdam.segment_ql).toBe("FILTER home_distance_km <= 80.5 FROM user");
    expect(bySlug.near_amsterdam_volt_owners.segment_ql).toBe('FILTER AND (home_distance_km <= 80.5, product_purchase_ts.`RP Volt` < "now-1y") FROM user');
    expect(bySlug.near_amsterdam_volt_commuters.segment_ql).toBe(
      'FILTER AND (home_distance_km <= 80.5, product_purchase_ts.`RP Volt` < "now-1y", lytics_content.Commuting >= 0.2) FROM user',
    );
    expect(bySlug.rp_check_seeded.segment_ql).toBe('FILTER seed_batch = "rp-demo-kit" FROM user');
    expect(bySlug.near_amsterdam.name).toBe("Customers near Amsterdam");
    expect(bySlug.near_amsterdam_volt_owners.name).toBe("Volt owners near Amsterdam (bought over a year ago)");
    expect(bySlug.near_amsterdam_volt_commuters.name).toBe("Volt owners near Amsterdam who read about commuting");
    expect(Object.keys(bySlug).some((s) => /^rp_check_q/.test(s))).toBe(false);
  });

  it("builds the Roam URL from the site domain", async () => {
    const { DOMAIN } = await import("./catalog.mjs");
    const q = audiences({ commutingThreshold: 0.2 }).find((a) => a.slug_name === "roam_intent").segment_ql;
    expect(q).toContain(`${DOMAIN}/en/pdp/rp-roam`);
  });
});
