import { describe, it, expect, vi } from "vitest";
import { createdFromArgs, normalizeQl, parseAudienceActions, upsertSegments } from "./upsertSegments.mjs";

const defs = [
  { slug_name: "new_one", name: "New", segment_ql: "FILTER a FROM user" },
  { slug_name: "changed", name: "Changed", segment_ql: "FILTER b2 FROM user" },
  { slug_name: "same", name: "Same", segment_ql: "FILTER c FROM user" },
];
const client = (existing) => ({
  getSegments: vi.fn(async () => ({ data: existing })),
  createSegment: vi.fn(async () => ({})),
  request: vi.fn(async () => ({})),
});

describe("upsertSegments", () => {
  it("reports which slugs it created, updated or left unchanged, one JSON line per audience", async () => {
    const c = client([
      { id: "s1", slug_name: "changed", segment_ql: "FILTER b FROM user", is_public: false, save_hist: true },
      { id: "s2", slug_name: "same", segment_ql: "FILTER c FROM user", is_public: false, save_hist: true },
    ]);
    const lines = [];
    const r = await upsertSegments({ client: c, defs, created: ["changed"], log: (l) => lines.push(l) });
    expect(r).toEqual({ created: ["new_one"], updated: ["changed"], unchanged: ["same"] });
    expect(c.createSegment).toHaveBeenCalledTimes(1);
    expect(c.request).toHaveBeenCalledWith("PUT", "/api/segment/s1", expect.objectContaining({ id: "s1" }));
    expect(parseAudienceActions(lines.join("\n"))).toEqual([
      { audience: "new_one", action: "created" },
      { audience: "changed", action: "updated" },
      { audience: "same", action: "unchanged" },
    ]);
  });

  it("a failure partway still leaves the lines for the audiences already written", async () => {
    const c = client([]);
    c.createSegment.mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => { throw new Error("boom"); });
    const lines = [];
    await expect(upsertSegments({ client: c, defs, log: (l) => lines.push(l) })).rejects.toThrow("boom");
    expect(parseAudienceActions(lines.join("\n"))).toEqual([{ audience: "new_one", action: "created" }]);
  });

  it("dry run writes nothing and emits no action lines", async () => {
    const c = client([]);
    const lines = [];
    await upsertSegments({ client: c, defs, dryRun: true, log: (l) => lines.push(l) });
    expect(c.createSegment).not.toHaveBeenCalled();
    expect(parseAudienceActions(lines.join("\n"))).toEqual([]);
  });

  it("refuses (exit 3, nothing written) when an audience the kit didn't create has the same slug and another definition (R35)", async () => {
    const c = client([{ id: "s1", slug_name: "changed", segment_ql: "FILTER b FROM user", is_public: false, save_hist: true }]);
    const lines = [];
    await expect(upsertSegments({ client: c, defs, created: [], log: (l) => lines.push(l) })).rejects.toMatchObject({
      code: 3,
      message: "changed: an audience with this slug already exists with a different definition; rename or delete it, then re-run.",
      hint: expect.stringMatching(/Nothing was changed/),
    });
    expect(c.createSegment).not.toHaveBeenCalled();
    expect(c.request).not.toHaveBeenCalled();
    expect(parseAudienceActions(lines.join("\n"))).toEqual([]);
  });

  it("adopts, without writing, an audience it didn't create whose definition matches (whitespace aside)", async () => {
    const c = client([{ id: "s2", slug_name: "same", segment_ql: "FILTER  c\n FROM user ", is_public: true, save_hist: false }]);
    const lines = [];
    const r = await upsertSegments({ client: c, defs: [defs[2]], log: (l) => lines.push(l) });
    expect(r).toEqual({ created: [], updated: [], unchanged: ["same"] });
    expect(c.request).not.toHaveBeenCalled();
    expect(parseAudienceActions(lines.join("\n"))).toEqual([{ audience: "same", action: "unchanged" }]);
  });

  it("normalizeQl ignores whitespace differences only", () => {
    expect(normalizeQl(" FILTER  a\n FROM user ")).toBe("FILTER a FROM user");
    expect(normalizeQl("FILTER a FROM user")).not.toBe(normalizeQl("FILTER b FROM user"));
  });

  it("createdFromArgs reads --created <slugs>", () => {
    expect(createdFromArgs(["audiences", "--created", "a,b"])).toEqual(["a", "b"]);
    expect(createdFromArgs(["audiences", "--created", ""])).toEqual([]);
    expect(createdFromArgs(["audiences"])).toEqual([]);
  });
});
