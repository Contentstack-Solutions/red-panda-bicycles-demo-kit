import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArgs } from "./import-contentstack.mjs";
import { fakeCma } from "./lib/fakeCma.mjs";

// Placeholder credentials; the tests check they never reach the output.
const TOKEN = ["placeholder", "management", "value"].join("-");
const API_KEY = ["placeholder", "stack", "key"].join("-");
const readFile = async () => Buffer.from("img");

function harness(fake) {
  const lines = [];
  const statePath = join(mkdtempSync(join(tmpdir(), "kit-import-")), "state.json");
  const deps = { cma: fake?.cma, statePath, readFile, out: (s) => lines.push(s), err: (s) => lines.push(s) };
  return { deps, lines, statePath };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CONTENTSTACK_API_KEY", API_KEY);
  vi.stubEnv("CONTENTSTACK_MANAGEMENT_TOKEN", TOKEN);
  vi.stubEnv("SITE_URL", "https://site.example");
  vi.stubEnv("CONTENTSTACK_PUBLISH_ENVIRONMENTS", "preview");
});

describe("import-contentstack CLI", () => {
  it("parses --dry-run and --snapshot, rejects unknown flags with exit 2", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, withoutCommerce: false, snapshot: "seed/contentstack" });
    expect(parseArgs(["--dry-run", "--snapshot", "x/y"])).toEqual({ dryRun: true, withoutCommerce: false, snapshot: "x/y" });
    expect(parseArgs(["--without-commerce"]).withoutCommerce).toBe(true);
    expect(() => parseArgs(["--force"])).toThrow(expect.objectContaining({ code: 2 }));
    expect(() => parseArgs(["--snapshot"])).toThrow(expect.objectContaining({ code: 2 }));
  });

  it("exits 2 naming missing env vars, without printing tokens", async () => {
    vi.stubEnv("SITE_URL", "");
    const { deps, lines } = harness(fakeCma());
    expect(await main([], deps)).toBe(2);
    expect(lines.join("\n")).toContain("SITE_URL");
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("exits 3 listing conflicts and writes nothing", async () => {
    const fake = fakeCma({ store: new Map([["/content_types/page", { uid: "page" }]]) });
    const { deps, lines, statePath } = harness(fake);
    expect(await main([], deps)).toBe(3);
    expect(lines.join("\n")).toContain("  - content_type:page");
    expect(fake.writes()).toEqual([]);
    expect(existsSync(statePath)).toBe(false);
  });

  it("imports, prints the per-phase summary and dangling warnings, and records the phase", async () => {
    const fake = fakeCma();
    const { deps, lines, statePath } = harness(fake);
    expect(await main([], deps)).toBe(0);
    const text = lines.join("\n");
    expect(text).toMatch(/phase\s+created\s+updated\s+skipped/);
    expect(text).toMatch(/entries:base\s+31\s+1\s+0/);
    expect(text).toContain("warning: dangling reference");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(API_KEY);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.phases.contentstack).toEqual({ done: true, at: expect.any(String) });
    expect(state.ids.homepage).toBeTruthy();
  });

  it("--dry-run writes nothing and leaves no state file", async () => {
    const fake = fakeCma();
    const { deps, statePath } = harness(fake);
    expect(await main(["--dry-run"], deps)).toBe(0);
    expect(fake.writes()).toEqual([]);
    expect(existsSync(statePath)).toBe(false);
  });

  it("publishes to CONTENTSTACK_ENVIRONMENT when CONTENTSTACK_PUBLISH_ENVIRONMENTS is unset", async () => {
    vi.stubEnv("CONTENTSTACK_PUBLISH_ENVIRONMENTS", "");
    vi.stubEnv("CONTENTSTACK_ENVIRONMENT", "launch");
    const { deps, lines } = harness(fakeCma());
    await main(["--dry-run"], deps);
    expect(lines.join("\n")).toContain("(publish environments: launch)");
  });

  it("doesn't mark the phase done while publishing is deferred: exit 2 naming the missing environment (I8)", async () => {
    vi.stubEnv("CONTENTSTACK_PUBLISH_ENVIRONMENTS", "launch");
    const store = new Map();
    const fake = fakeCma({ store });
    const { deps, lines, statePath } = harness(fake);
    expect(await main([], deps)).toBe(2);
    const text = lines.join("\n");
    expect(text).toContain("launch");
    expect(text).toContain("docs/manual-steps.md §2");
    expect(fake.writes().some((w) => w.path.endsWith("/publish"))).toBe(false);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.phases.contentstack).toBeUndefined();

    // The SE creates the environment; the re-run publishes what was skipped and finishes the phase.
    store.set("/environments/launch", { name: "launch" });
    lines.length = 0;
    expect(await main([], deps)).toBe(0);
    const after = JSON.parse(readFileSync(statePath, "utf8"));
    expect(after.phases.contentstack).toEqual({ done: true, at: expect.any(String) });
    expect(lines.join("\n")).toMatch(/publish:entries\s+0\s+\d+\s+0/);
  });
});

