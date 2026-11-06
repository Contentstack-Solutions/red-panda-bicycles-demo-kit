// Leak sweep: fails when an identifier or word from the original demo is left in the kit.
// This file and its test necessarily contain the forbidden strings, so both are skipped.
//
// Usage: npm run kit:sweep                  the working tree (tracked and untracked, not ignored)
//        npm run kit:sweep -- --history     every reachable commit's files and every commit
//                                           message, reported as <commit>:<path>:<line>
//        npm run kit:sweep -- --history --ref publish   only the commits reachable from one ref
// Exit 0 when nothing is found, 1 otherwise.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATTERNS = [
  /blt92af9a13ce5f6a6b/,
  /blt3f5f7cc6e1cc8c05/,
  /6ab3f50e2b53e7bce0fa401d/,
  /6cec06de73504a8dc3b8b53b6481c35a/,
  /bltc82993d38e486138/,
  /blt6194c912e26ab6a4/,
  /cs4ac34090047249/,
  /blt1fdf027563b56302/,
  /blte3ee59219c40c0e9/,
  /cs80933588790c29b9/,
  /(?:^|[^a-z])aid[^0-9a-z]{0,6}12075(?!\d)/i,
  /john\+/,
  /john\.kelly/,
  /red-panda-bicycles\.contentstackapps\.com/,
  /keynote/i,
  /CCON/i,
  /rehearsal/i,
  /zz_/,
];

// Any Contentstack-style UID (blt + 16 hex, cs + 14 hex). Not reported under seed/contentstack/
// (the snapshot keeps its source UIDs; the import remaps them), nor for a UID the snapshot itself
// contains (tests refer to snapshot entries), nor for an obviously fake one (zeros after the
// prefix, e.g. blt0000000000000001), nor when a specific pattern above already reports it.
const GENERIC = [/\bblt[0-9a-f]{16}\b/g, /\bcs[0-9a-f]{14}\b/g];
const FAKE_UID = /^(?:blt|cs)0{8,}[0-9a-f]*$/;

// Snapshot entries keep their source UIDs as identifiers (the import remaps them), so these two
// entry-UID patterns are not reported under seed/contentstack/. Every other pattern still applies there.
const SNAPSHOT_UID_PATTERNS = new Set([/blt92af9a13ce5f6a6b/.source, /blt3f5f7cc6e1cc8c05/.source]);
const SNAPSHOT_DIR = "seed/contentstack/";

const SELF = new Set(["scripts/kit/sweep.mjs", "scripts/kit/sweep.test.mjs"]);
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp", ".tiff",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf", ".zip", ".gz", ".mp4", ".mov", ".webm", ".mp3",
]);

const norm = (p) => p.split(path.sep).join("/");
const inSnapshot = (p) => norm(p).startsWith(SNAPSHOT_DIR);
const isBinaryPath = (p) => BINARY_EXT.has(path.extname(p).toLowerCase());

function skip(p) {
  const n = norm(p);
  return SELF.has(n) || LOCKFILES.has(path.posix.basename(n));
}

/** Every generic-pattern UID that appears in snapshot files. */
export function snapshotUids(files) {
  const out = new Set();
  for (const { path: p, text } of files) {
    if (!inSnapshot(p)) continue;
    for (const re of GENERIC) for (const m of text.match(re) ?? []) out.add(m);
  }
  return out;
}

/**
 * @param {{path: string, text: string, commit?: string}[]} files
 * @param {{snapshotUids?: Set<string>}} [opts]  defaults to the UIDs in the files under seed/contentstack/
 * @returns {{path: string, line: number, pattern: string, commit?: string}[]}
 */
export function findLeaks(files, { snapshotUids: known = snapshotUids(files) } = {}) {
  const leaks = [];
  for (const { path: p, text, commit } of files) {
    if (skip(p)) continue;
    const snap = inSnapshot(p);
    const at = commit ? { commit } : {};
    text.split("\n").forEach((line, i) => {
      for (const re of PATTERNS) {
        if (SNAPSHOT_UID_PATTERNS.has(re.source) && snap) continue;
        if (re.test(line)) leaks.push({ path: p, line: i + 1, pattern: re.source, ...at });
      }
      if (snap) return;
      for (const re of GENERIC) {
        const hit = (line.match(re) ?? []).some((uid) => !FAKE_UID.test(uid) && !known.has(uid) && !PATTERNS.some((s) => s.test(uid)));
        if (hit) leaks.push({ path: p, line: i + 1, pattern: re.source, ...at });
      }
    });
  }
  return leaks;
}

export const formatLeak = (l) => `${l.commit ? `${l.commit.slice(0, 12)}:` : ""}${l.path}:${l.line} ${l.pattern}`;

const git = (cwd, args, opts = {}) => execFileSync("git", args, { cwd, maxBuffer: 1024 * 1024 * 1024, ...opts });

/** The working tree: tracked and untracked files that aren't ignored. */
export function sweepTree(cwd = process.cwd()) {
  const listed = git(cwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const files = [];
  for (const p of listed) {
    if (isBinaryPath(p)) continue;
    let buf;
    try {
      buf = readFileSync(path.join(cwd, p));
    } catch {
      continue; // listed but deleted in the working tree
    }
    if (buf.includes(0)) continue; // binary
    files.push({ path: p, text: buf.toString("utf8") });
  }
  return findLeaks(files);
}

// Reads blobs with one `git cat-file --batch`. Returns sha → Buffer.
function readBlobs(cwd, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const buf = git(cwd, ["cat-file", "--batch"], { input: shas.join("\n") + "\n" });
  let pos = 0;
  while (pos < buf.length) {
    const nl = buf.indexOf(10, pos);
    const [sha, type, size] = buf.subarray(pos, nl).toString("utf8").split(" ");
    pos = nl + 1;
    if (type === "missing") continue;
    const n = Number(size);
    out.set(sha, buf.subarray(pos, pos + n));
    pos += n + 1;
  }
  return out;
}

/**
 * Every reachable commit (all refs, or only `ref`'s): each file version is checked once, reported
 * with the oldest commit that has it; and every commit message, reported as "(commit message)".
 */
export function sweepHistory(cwd = process.cwd(), { ref } = {}) {
  const revs = ref ? [ref] : ["--all"];
  const commits = git(cwd, ["rev-list", "--reverse", ...revs, "--"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const versions = new Map(); // blob sha + path → { sha, path, commit }
  for (const commit of commits) {
    for (const rec of git(cwd, ["ls-tree", "-r", "-z", commit], { encoding: "utf8" }).split("\0")) {
      if (!rec) continue;
      const tab = rec.indexOf("\t");
      const [, type, sha] = rec.slice(0, tab).split(" ");
      const p = rec.slice(tab + 1);
      if (type !== "blob" || isBinaryPath(p) || skip(p)) continue;
      const key = `${sha}\0${p}`;
      if (!versions.has(key)) versions.set(key, { sha, path: p, commit });
    }
  }
  const blobs = readBlobs(cwd, [...new Set([...versions.values()].map((v) => v.sha))]);
  const files = [];
  for (const v of versions.values()) {
    const buf = blobs.get(v.sha);
    if (!buf || buf.includes(0)) continue;
    files.push({ path: v.path, commit: v.commit, text: buf.toString("utf8") });
  }
  const log = git(cwd, ["log", "--format=%H%x00%B%x00", ...revs, "--"], { encoding: "utf8" }).split("\0");
  for (let i = 0; i + 1 < log.length; i += 2) {
    files.push({ path: "(commit message)", commit: log[i].trim(), text: log[i + 1].replace(/\n+$/, "") });
  }
  return findLeaks(files);
}

function main(argv) {
  const usage = "Usage: npm run kit:sweep [-- --history [--ref <branch>]]";
  let history = false;
  let ref;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--history") history = true;
    else if (argv[i] === "--ref" && argv[i + 1] && !argv[i + 1].startsWith("--")) ref = argv[++i];
    else {
      console.error(`Unknown or incomplete argument "${argv[i]}". ${usage}`);
      process.exit(2);
    }
  }
  if (ref && !history) {
    console.error(`--ref needs --history. ${usage}`);
    process.exit(2);
  }
  const leaks = history ? sweepHistory(process.cwd(), { ref }) : sweepTree();
  for (const l of leaks) console.log(formatLeak(l));
  console.log(`${leaks.length} leak(s) found${history ? " in history (every commit's files and messages)" : ""}`);
  process.exit(leaks.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
