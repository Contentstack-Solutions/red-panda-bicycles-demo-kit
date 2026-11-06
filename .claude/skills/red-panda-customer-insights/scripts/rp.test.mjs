import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULTS, baseDraftStatus, loadRepoEnv, buildVariants, clients, createCredentials, decodeKeychainValue, findByRef, normalizeQl,
  parseArgs, parseEnvFile, pickVariant, planAddVariant, redact, runCommand, slugify, stripSystemFields, toSegmentQl,
} from "./rp.mjs";

describe("parseEnvFile", () => {
  it("reads KEY=value lines, export prefixes, quotes and comments", () => {
    const text = `# keys\nexport LYTICS_ACCESS_TOKEN="abc 123"\nCONTENTSTACK_API_KEY=blt1 # stack\n\nCS_AUTHTOKEN: 'tok'\nnot a line`;
    expect(parseEnvFile(text)).toEqual({ LYTICS_ACCESS_TOKEN: "abc 123", CONTENTSTACK_API_KEY: "blt1", CS_AUTHTOKEN: "tok" });
  });
});

describe("decodeKeychainValue", () => {
  it("decodes the hex that security prints for multi-line values", () => {
    const text = "A=1\nB=2";
    expect(decodeKeychainValue(Buffer.from(text).toString("hex"))).toBe(text);
  });

  it("leaves ordinary tokens alone, even hex-looking ones", () => {
    expect(decodeKeychainValue("blt0000000000000001")).toBe("blt0000000000000001");
    expect(decodeKeychainValue("deadbeef")).toBe("deadbeef");
  });
});

describe("createCredentials", () => {
  const noKeychain = () => null;

  it("prefers env, then a keychain item per key, then a keychain keys file, then files", () => {
    const keychain = (service, account) => {
      if (service === "red-panda" && account === "CONTENTSTACK_API_KEY") return "from-keychain";
      if (service === "red-panda-credentials") return "CONTENTSTACK_MANAGEMENT_TOKEN=from-keychain-file\nLYTICS_ACCESS_TOKEN=shadowed";
      return null;
    };
    const creds = createCredentials({
      env: { LYTICS_API_TOKEN: "from-env" },
      keychain,
      files: ["/f"],
      readFile: () => "CS_AUTHTOKEN=from-file",
    });
    expect(creds.get("LYTICS_ACCESS_TOKEN")).toBe("from-env");
    expect(creds.source("LYTICS_ACCESS_TOKEN")).toBe("env LYTICS_API_TOKEN");
    expect(creds.get("CONTENTSTACK_API_KEY")).toBe("from-keychain");
    expect(creds.get("CONTENTSTACK_MANAGEMENT_TOKEN")).toBe("from-keychain-file");
    expect(creds.get("CONTENTSTACK_AUTHTOKEN")).toBe("from-file");
  });

  it("also finds a keychain item named red-panda/<KEY>", () => {
    const keychain = (service, account) =>
      service === "red-panda/LYTICS_ACCESS_TOKEN" && account === undefined ? "from-slash-item" : null;
    const creds = createCredentials({ env: {}, keychain, files: [] });
    expect(creds.get("LYTICS_ACCESS_TOKEN")).toBe("from-slash-item");
    expect(creds.source("LYTICS_ACCESS_TOKEN")).toBe('keychain "red-panda/LYTICS_ACCESS_TOKEN"');
  });

  it("a stored authtoken beats a stale one in env (rp.mjs login stores the fresh one)", () => {
    const fileOnly = createCredentials({
      env: { CONTENTSTACK_AUTHTOKEN: "stale-env-token" }, keychain: noKeychain, files: ["/f"], readFile: () => "CONTENTSTACK_AUTHTOKEN=fresh-file-token",
    });
    expect(fileOnly.get("CONTENTSTACK_AUTHTOKEN")).toBe("fresh-file-token");
    expect(fileOnly.source("CONTENTSTACK_AUTHTOKEN")).toBe("/f");
    const keychainItem = createCredentials({
      env: { CONTENTSTACK_AUTHTOKEN: "stale-env-token" },
      keychain: (service, account) => (service === "red-panda" && account === "CONTENTSTACK_AUTHTOKEN" ? "fresh-keychain-token" : null),
      files: [],
    });
    expect(keychainItem.get("CONTENTSTACK_AUTHTOKEN")).toBe("fresh-keychain-token");
    // Nothing stored: env is still used.
    expect(createCredentials({ env: { CONTENTSTACK_AUTHTOKEN: "env-token" }, keychain: noKeychain, files: [] }).get("CONTENTSTACK_AUTHTOKEN")).toBe("env-token");
  });

  it("finds the Brand Kit OAuth token in the store, store-first (R32)", () => {
    const fromFile = createCredentials({
      env: { CONTENTSTACK_OAUTH_TOKEN: "stale-env-oauth" }, keychain: noKeychain, files: ["/f"], readFile: () => "CONTENTSTACK_OAUTH_TOKEN=file-oauth",
    });
    expect(fromFile.get("CONTENTSTACK_OAUTH_TOKEN")).toBe("file-oauth");
    const fromKeychain = createCredentials({
      env: {}, keychain: (service, account) => (service === "red-panda" && account === "CONTENTSTACK_OAUTH_TOKEN" ? "keychain-oauth" : null), files: [],
    });
    expect(fromKeychain.get("CONTENTSTACK_OAUTH_TOKEN")).toBe("keychain-oauth");
    expect(fromKeychain.has("CONTENTSTACK_AUTHTOKEN")).toBe(false);
  });

  it("every other key stays env-first", () => {
    const store = "LYTICS_ACCESS_TOKEN=file-lytics\nCONTENTSTACK_API_KEY=file-key\nCONTENTSTACK_MANAGEMENT_TOKEN=file-mgmt";
    const creds = createCredentials({
      env: { LYTICS_ACCESS_TOKEN: "env-lytics", CONTENTSTACK_API_KEY: "env-key", CONTENTSTACK_MANAGEMENT_TOKEN: "env-mgmt" },
      keychain: (service, account) => (account ? `keychain-${account}` : null), files: ["/f"], readFile: () => store,
    });
    expect(creds.get("LYTICS_ACCESS_TOKEN")).toBe("env-lytics");
    expect(creds.get("CONTENTSTACK_API_KEY")).toBe("env-key");
    expect(creds.get("CONTENTSTACK_MANAGEMENT_TOKEN")).toBe("env-mgmt");
  });

  it("throws a missing-credential error with exit code 2", () => {
    const creds = createCredentials({ env: {}, keychain: noKeychain, files: [] });
    expect(creds.has("LYTICS_ACCESS_TOKEN")).toBe(false);
    expect(() => creds.get("LYTICS_ACCESS_TOKEN")).toThrow(expect.objectContaining({ code: 2 }));
  });
});

describe("redact", () => {
  it("removes secret values from output", () => {
    expect(redact('{"t":"secret-token-1"}', ["secret-token-1", "abc"])).toBe('{"t":"[redacted]"}');
  });
});

describe("audience helpers", () => {
  it("slugifies names the way the team names audiences", () => {
    expect(slugify("Roam Commuter Campaign")).toBe("roam_commuter_campaign");
    expect(slugify("Volt Owners × Commuting")).toBe("volt_owners_commuting");
  });

  it("wraps a bare condition as a full segment QL statement", () => {
    expect(toSegmentQl("home_distance_km <= 80.5")).toBe("FILTER home_distance_km <= 80.5 FROM user");
    expect(toSegmentQl("FILTER EXISTS roam_preorder_ts FROM user")).toBe("FILTER EXISTS roam_preorder_ts FROM user");
    expect(() => toSegmentQl("")).toThrow();
  });

  it("treats definitions that differ only in spacing as the same", () => {
    const a = "FILTER AND (home_distance_km <= 80.5, lytics_content.Commuting >= 0.2) FROM user";
    const b = "FILTER AND(home_distance_km <= 80.5,lytics_content.Commuting >= 0.2)  FROM user";
    expect(normalizeQl(a)).toBe(normalizeQl(b));
    expect(normalizeQl(a)).not.toBe(normalizeQl(a.replace("0.2", "0.3")));
  });

  it("finds items by any of the given fields, case-insensitively", () => {
    const items = [{ id: "1", slug: "roam_preorder", name: "RP Roam Pre-orders" }];
    expect(findByRef(items, "RP ROAM PRE-ORDERS", ["id", "slug", "name"])).toBe(items[0]);
    expect(findByRef(items, "nope", ["id", "slug", "name"])).toBeNull();
    expect(findByRef(items, undefined, ["id"])).toBeNull();
  });
});

describe("buildVariants", () => {
  const audiences = [
    { uid: "lyt1", slug: "roam_commuter_campaign", name: "Roam Commuter Campaign", source: "LYTICS" },
    { uid: "pz1", name: "Dutch visitors", source: "PERSONALIZE" },
  ];

  it("targets Lytics audiences through lyticsAudiences and others through audiences", () => {
    expect(buildVariants([{ audience: "roam_commuter_campaign" }, { name: "NL", audience: "Dutch visitors" }], audiences)).toEqual([
      { __type: "SegmentedVariant", name: "Roam Commuter Campaign", audiences: [], lyticsAudiences: ["lyt1"], audienceCombinationType: "AND" },
      { __type: "SegmentedVariant", name: "NL", audiences: ["pz1"], lyticsAudiences: [], audienceCombinationType: "AND" },
    ]);
  });

  it("fails clearly when an audience isn't in Personalize", () => {
    expect(() => buildVariants([{ audience: "missing" }], audiences)).toThrow(/not found: missing/);
  });
});

describe("baseDraftStatus", () => {
  const envs = ["envA", "envB"];

  it("is clean when every environment has the latest base version", () => {
    const entry = { _version: 3, publish_details: [{ environment: "envA", locale: "en", version: 3 }, { environment: "envB", locale: "en", version: 3 }] };
    expect(baseDraftStatus(entry, envs, "en")).toEqual({ base_version: 3, has_draft: false, behind: [] });
  });

  it("flags environments behind the latest version, or never published, and ignores variant publishes", () => {
    const entry = {
      _version: 4,
      publish_details: [
        { environment: "envA", locale: "en", version: 3 },
        { environment: "envB", locale: "en", version: 4, variant_uid: "cs1" },
      ],
    };
    expect(baseDraftStatus(entry, envs, "en")).toEqual({
      base_version: 4,
      has_draft: true,
      behind: [{ environment: "envA", published_version: 3 }, { environment: "envB", published_version: null }],
    });
  });
});

describe("pickVariant", () => {
  const experience = { name: "Battery hero", _cms: { variants: { 0: "csA", 1: "csB" } } };
  const variants = [{ name: "Volt commuters", shortUid: "0" }, { name: "Roam intent", shortUid: "1" }];

  it("picks by name or short uid and returns the stack variant uid", () => {
    expect(pickVariant(experience, variants, "roam intent")).toEqual({ name: "Roam intent", short_uid: "1", cms_variant_uid: "csB" });
    expect(pickVariant(experience, variants, "0").cms_variant_uid).toBe("csA");
  });

  it("uses the only variant when none is named, and asks when there are several", () => {
    expect(pickVariant(experience, variants.slice(0, 1), undefined).cms_variant_uid).toBe("csA");
    expect(() => pickVariant(experience, variants, undefined)).toThrow(/has 2 variants/);
  });

  it("explains when the variant hasn't synced to the stack yet", () => {
    expect(() => pickVariant({ name: "New", _cms: {} }, [{ name: "v", shortUid: "0" }], "v")).toThrow(/hasn't synced/);
  });
});

describe("planAddVariant", () => {
  const seg = (name, lytics, shortUid) => ({
    __type: "SegmentedVariant", name, audiences: [], lyticsAudiences: [lytics], audienceCombinationType: "AND", ...(shortUid ? { shortUid } : {}),
  });
  const active = { uid: "v2", status: "ACTIVE", variants: [seg("Commuters", "lyt1", "0")] };
  const added = seg("Roam intent", "lyt2");

  it("adds to the live variants, keeping their short uids, and drafts a new version", () => {
    const plan = planAddVariant([active, { uid: "v1", status: "ARCHIVED", variants: [] }], added);
    expect(plan).toMatchObject({ status: "planned", live: active, draft: null });
    expect(plan.variants).toEqual([seg("Commuters", "lyt1", "0"), added]);
  });

  it("reuses an untouched draft, or its own unfinished draft", () => {
    const copy = { uid: "v3", status: "DRAFT", variants: [seg("Commuters", "lyt1", "0")] };
    expect(planAddVariant([active, copy], added).draft).toBe(copy);
    const unfinished = { ...copy, variants: [seg("Commuters", "lyt1", "0"), seg("Roam intent", "lyt2", "1")] };
    const resumed = planAddVariant([active, unfinished], added);
    expect(resumed.draft).toBe(unfinished);
    expect(resumed.variants).toEqual([seg("Commuters", "lyt1", "0"), seg("Roam intent", "lyt2", "1")]);
  });

  it("stops for a person when someone else's draft has other changes", () => {
    const other = { uid: "v3", status: "DRAFT", variants: [seg("Commuters", "lyt1", "0"), seg("Locals", "lyt9")] };
    expect(() => planAddVariant([active, other], added)).toThrow(expect.objectContaining({ code: 3 }));
  });

  it("edits the draft directly when the experience has never gone live", () => {
    const draft = { uid: "v1", status: "DRAFT", variants: [seg("Commuters", "lyt1", "0")] };
    expect(planAddVariant([draft], added)).toMatchObject({ live: null, draft, variants: [seg("Commuters", "lyt1", "0"), added] });
  });

  it("reports an existing variant for the same audience, and a name clash as a decision", () => {
    expect(planAddVariant([active], seg("Anything", "lyt1"))).toMatchObject({ status: "exists", variant: active.variants[0] });
    expect(() => planAddVariant([active], seg("commuters", "lyt2"))).toThrow(expect.objectContaining({ code: 3 }));
  });
});

describe("misc", () => {
  it("parses positional args and flags", () => {
    expect(parseArgs(["a", "--json", "{}", "--email=x@y.z", "--dry"])).toEqual({ positional: ["a"], flags: { json: "{}", email: "x@y.z", dry: true } });
  });

  it("strips system fields before an entry update", () => {
    expect(stripSystemFields({ uid: "u", _version: 2, title: "T", publish_details: [], headline: "H" })).toEqual({ title: "T", headline: "H" });
  });
});

describe("environment-driven settings", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const creds = () => createCredentials({ env: { CONTENTSTACK_API_KEY: "api_key_1", CONTENTSTACK_MANAGEMENT_TOKEN: "mgmt_token_1", CONTENTSTACK_AUTHTOKEN: "auth_token_1" }, keychain: () => null, files: [] });

  it("rp.mjs DEFAULTS read env", () => {
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_PROJECT_UID", "proj_new");
    vi.stubEnv("PERSONALIZE_PROJECT_UID", "proj_legacy");
    vi.stubEnv("CONTENTSTACK_PUBLISH_ENVIRONMENTS", "preview, launch ,");
    expect(DEFAULTS.personalizeProject).toBe("proj_new");
    expect(DEFAULTS.environments).toEqual(["preview", "launch"]);

    vi.stubEnv("CONTENTSTACK_PERSONALIZE_PROJECT_UID", "");
    expect(DEFAULTS.personalizeProject).toBe("proj_legacy");
    vi.stubEnv("PERSONALIZE_PROJECT_UID", "");
    expect(DEFAULTS.personalizeProject).toBeNull();

    vi.stubEnv("CONTENTSTACK_PUBLISH_ENVIRONMENTS", "");
    vi.stubEnv("CONTENTSTACK_ENVIRONMENT", "launch");
    expect(DEFAULTS.environments).toEqual(["launch"]);
    vi.stubEnv("CONTENTSTACK_ENVIRONMENT", "");
    expect(DEFAULTS.environments).toEqual(["preview"]);
    expect(DEFAULTS.locale).toBe("en");
  });

  it("runCommand calls the CMA host from env and resolves environment names to uids", async () => {
    vi.stubEnv("CONTENTSTACK_MANAGEMENT_HOST", "eu-api.contentstack.com");
    vi.stubEnv("CONTENTSTACK_PUBLISH_ENVIRONMENTS", "preview");
    const seen = [];
    vi.stubGlobal("fetch", async (url, init) => {
      seen.push([init.method, String(url)]);
      const body = String(url).includes("/v3/environments")
        ? { environments: [{ uid: "env_uid_1", name: "preview" }, { uid: "env_uid_2", name: "launch" }] }
        : { entry: { uid: "entry_1" } };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const out = await runCommand("cms-publish-entry", { input: { content_type: "hero_banner", entry: "entry_1" } }, creds());
    expect(out).toEqual({ status: "queued", entry: "entry_1", environments: ["env_uid_1"] });
    expect(seen.map(([, u]) => new URL(u).host)).toEqual(["eu-api.contentstack.com", "eu-api.contentstack.com"]);
    expect(seen[1]).toEqual(["POST", "https://eu-api.contentstack.com/v3/content_types/hero_banner/entries/entry_1/publish"]);
  });

  it("sends the env project uid to Personalize, and fails clearly without one", async () => {
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_PROJECT_UID", "proj_new");
    let headers;
    vi.stubGlobal("fetch", async (url, init) => { headers = init.headers; return new Response("[]", { status: 200 }); });
    await clients(creds()).personalize("GET", "/audiences");
    expect(headers["x-project-uid"]).toBe("proj_new");

    vi.stubEnv("CONTENTSTACK_PERSONALIZE_PROJECT_UID", "");
    vi.stubEnv("PERSONALIZE_PROJECT_UID", "");
    await expect(runCommand("personalize-audiences", {}, creds())).rejects.toMatchObject({ code: 2, message: expect.stringMatching(/CONTENTSTACK_PERSONALIZE_PROJECT_UID/) });
  });

  it("sends Personalize calls to CONTENTSTACK_PERSONALIZE_API_HOST when set, else the US host (R34)", async () => {
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_PROJECT_UID", "proj_new");
    const urls = [];
    vi.stubGlobal("fetch", async (url) => { urls.push(String(url)); return new Response("[]", { status: 200 }); });
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_API_HOST", "");
    await clients(creds()).personalize("GET", "/audiences");
    vi.stubEnv("CONTENTSTACK_PERSONALIZE_API_HOST", "personalize.example.test");
    await clients(creds()).personalize("GET", "/audiences");
    expect(urls).toEqual(["https://personalize-api.contentstack.com/audiences", "https://personalize.example.test/audiences"]);
  });

  it("puts Contentstack's error_code on the error details", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error_message: "Session timed out", error_code: 105 }), { status: 401 }));
    await expect(runCommand("cms-entry", { input: { content_type: "hero_banner", entry: "entry_1" } }, creds()))
      .rejects.toMatchObject({ code: 1, details: { status: 401, error_code: 105 } });
  });

  it("rejects unknown commands with exit code 2", async () => {
    await expect(runCommand("nope", {}, creds())).rejects.toMatchObject({ code: 2 });
  });

  it("fills unset settings from the repo's .env.local without overriding the environment", () => {
    const dir = mkdtempSync(join(tmpdir(), "rp-env-"));
    const file = join(dir, ".env.local");
    writeFileSync(file, "# kit settings\nCONTENTSTACK_PERSONALIZE_PROJECT_UID=proj_from_file\nCONTENTSTACK_PUBLISH_ENVIRONMENTS=launch\nRP_TEST_ONLY_IN_FILE=\"x y\"\n");
    const keys = ["CONTENTSTACK_PERSONALIZE_PROJECT_UID", "PERSONALIZE_PROJECT_UID", "CONTENTSTACK_PUBLISH_ENVIRONMENTS", "RP_TEST_ONLY_IN_FILE"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      process.env.CONTENTSTACK_PUBLISH_ENVIRONMENTS = "preview";
      vi.stubEnv("RP_REPO_ENV_FILE", file);
      expect(DEFAULTS.personalizeProject).toBe("proj_from_file");
      expect(DEFAULTS.environments).toEqual(["preview"]);
      expect(process.env.RP_TEST_ONLY_IN_FILE).toBe("x y");
      // Loaded once: a later change to the environment is not overwritten from the file.
      delete process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID;
      expect(DEFAULTS.personalizeProject).toBeNull();
      expect(loadRepoEnv(join(dir, "missing.env"))).toEqual([]);
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
});
