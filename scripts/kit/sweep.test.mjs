import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLeaks, formatLeak, sweepHistory, sweepTree } from "./sweep.mjs";

const flagged = [
  "blt92af9a13ce5f6a6b",
  "blt3f5f7cc6e1cc8c05",
  "6ab3f50e2b53e7bce0fa401d",
  "6cec06de73504a8dc3b8b53b6481c35a",
  "bltc82993d38e486138",
  "blt6194c912e26ab6a4",
  "cs4ac34090047249",
  "AID 12075",
  "aid=12075",
  "AID `12075`",
  "\"aid\": 12075",
  "LYTICS_AID=12075",
  "AID **12075**",
  "aid 12075",
  "john+demo@example.com",
  "john.kelly@example.com",
  "https://red-panda-bicycles.contentstackapps.com/",
  "keynote",
  "Keynote",
  "CCON",
  "ccon",
  "rehearsal",
  "Rehearsal",
  "zz_check_audience",
  "blt1fdf027563b56302",
  "blte3ee59219c40c0e9",
  "cs80933588790c29b9",
];

describe("findLeaks", () => {
  it.each(flagged)("flags %s", (text) => {
    const leaks = findLeaks([{ path: "a.md", text: `hello ${text} world` }]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0].path).toBe("a.md");
    expect(leaks[0].line).toBe(1);
    expect(typeof leaks[0].pattern).toBe("string");
  });

  it("reports the 1-based line number", () => {
    const leaks = findLeaks([{ path: "a.md", text: "ok\nfine\nthe keynote\n" }]);
    expect(leaks.map((l) => l.line)).toEqual([3]);
  });

  it("returns [] for clean text", () => {
    expect(findLeaks([{ path: "a.md", text: "A bike shop.\nNothing here." }])).toEqual([]);
  });

  it("matches 12075 only as an account reference", () => {
    expect(findLeaks([{ path: "a.md", text: "id 120750 and 312075 and 12075 and paid 12075 and AID 120750" }])).toEqual([]);
  });

  it("ignores the sweep files themselves and lockfiles", () => {
    const text = "keynote CCON zz_";
    expect(
      findLeaks([
        { path: "scripts/kit/sweep.mjs", text },
        { path: "scripts/kit/sweep.test.mjs", text },
        { path: "package-lock.json", text },
      ]),
    ).toEqual([]);
  });
});

describe("snapshot entry-UID exemption", () => {
  it("does not flag the homepage UID in seed/contentstack/order.json", () => {
    expect(findLeaks([{ path: "seed/contentstack/order.json", text: '"blt92af9a13ce5f6a6b"\n"blt3f5f7cc6e1cc8c05"' }])).toEqual([]);
  });
  it("still flags the same UID elsewhere", () => {
    expect(findLeaks([{ path: "src/x.js", text: "const id = 'blt92af9a13ce5f6a6b';" }])).toHaveLength(1);
    expect(findLeaks([{ path: "seed/other/x.json", text: "blt3f5f7cc6e1cc8c05" }])).toHaveLength(1);
  });
  it("still flags the stack API key inside seed/contentstack", () => {
    expect(findLeaks([{ path: "seed/contentstack/entries/x/y.en.json", text: "https://images.contentstack.io/v3/assets/blt6194c912e26ab6a4/a" }])).toHaveLength(1);
  });
});

describe("generic UID patterns", () => {
  it("flags any blt + 16 hex or cs + 14 hex UID outside the snapshot", () => {
    const leaks = findLeaks([{ path: "src/x.js", text: "a bltabcdef0123456789 b\nc cs0123456789abcd d" }]);
    expect(leaks.map((l) => [l.line, l.pattern])).toEqual([[1, "\\bblt[0-9a-f]{16}\\b"], [2, "\\bcs[0-9a-f]{14}\\b"]]);
  });

  it("doesn't flag them under seed/contentstack/, but still does in other seed folders", () => {
    expect(findLeaks([{ path: "seed/contentstack/entries/page/x.en.json", text: '"uid": "bltabcdef0123456789"' }])).toEqual([]);
    expect(findLeaks([{ path: "seed/lytics/x.json", text: '"uid": "bltabcdef0123456789"' }])).toHaveLength(1);
  });

  it("doesn't flag the snapshot's own UIDs where tests refer to them", () => {
    const files = [
      { path: "seed/contentstack/order.json", text: '["bltabcdef0123456789"]' },
      { path: "scripts/kit/lib/importPlan.test.mjs", text: 'expect(uid).toBe("bltabcdef0123456789"); // and "blt9999999999999999"' },
    ];
    expect(findLeaks(files).map((l) => [l.path, l.line])).toEqual([["scripts/kit/lib/importPlan.test.mjs", 1]]);
  });

  it("doesn't flag obviously fake UIDs (zeros after the prefix)", () => {
    expect(findLeaks([{ path: "x.test.mjs", text: 'const HERO = "blt00000000000000aa", A = "blt0000000000000001", C = "cs00000000000001";' }])).toEqual([]);
  });

  it("is not fooled by longer hex runs or words", () => {
    expect(findLeaks([{ path: "x.md", text: "bltabcdef0123456789ab and xbltabcdef0123456789 and csabcdef" }])).toEqual([]);
  });
});

describe("--history", () => {
  const git = (dir, ...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8" });
  const write = (dir, rel, text) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };

  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "kit-sweep-"));
    git(dir, "init", "-q");
    write(dir, "a.md", "ok\nthe keynote talk\n");
    write(dir, "c.md", "a rehearsal note\n");
    write(dir, "seed/contentstack/order.json", '["bltaaaaaaaaaaaaaaaa"]\n');
    write(dir, "b.js", 'const ok = "bltaaaaaaaaaaaaaaaa";\nconst bad = "bltbbbbbbbbbbbbbbbb";\n');
    write(dir, "img.png", "keynote");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "first");
    rmSync(join(dir, "a.md"));
    write(dir, "b.js", 'const ok = "bltaaaaaaaaaaaaaaaa";\n');
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "CCON prep\n\nbody line");
    write(dir, "d.md", "clean\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "third");
    return dir;
  }

  it("finds leaks in every reachable commit's files and messages, which the tree sweep can't see", () => {
    const dir = repo();
    const first = git(dir, "rev-list", "--max-parents=0", "HEAD").trim();
    const second = git(dir, "rev-parse", "HEAD~1").trim();
    const tree = sweepTree(dir);
    expect(tree.map(formatLeak)).toEqual(["c.md:1 rehearsal"]);
    const history = sweepHistory(dir);
    expect(history.map(formatLeak).sort()).toEqual([
      `${first.slice(0, 12)}:a.md:2 keynote`,
      `${first.slice(0, 12)}:b.js:2 \\bblt[0-9a-f]{16}\\b`,
      `${first.slice(0, 12)}:c.md:1 rehearsal`,
      `${second.slice(0, 12)}:(commit message):1 CCON`,
    ].sort());
  });

  it("finds commits on other branches too, and reports an unchanged file once", () => {
    const dir = repo();
    git(dir, "checkout", "-q", "-b", "side", "HEAD~2");
    write(dir, "e.md", "zz_old\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "side");
    git(dir, "checkout", "-q", "-");
    const history = sweepHistory(dir).map(formatLeak);
    expect(history.some((l) => /:e\.md:1 zz_$/.test(l))).toBe(true);
    expect(history.filter((l) => l.includes(":c.md:"))).toHaveLength(1);
  });

  it("--ref limits the history to one branch: a fresh orphan commit of a clean tree has no leaks", () => {
    const dir = repo();
    rmSync(join(dir, "c.md"));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "clean up");
    git(dir, "checkout", "-q", "--orphan", "publish");
    git(dir, "commit", "-q", "-m", "Red Panda demo kit");
    expect(sweepHistory(dir, { ref: "publish" })).toEqual([]);
    expect(sweepHistory(dir).length).toBeGreaterThan(0); // the old branch is still reachable
  });
});

