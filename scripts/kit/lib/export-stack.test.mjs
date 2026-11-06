import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeOutDir, exportStack } from "./export-stack.mjs";

const repo = () => mkdtempSync(join(tmpdir(), "kit-export-"));

describe("assertSafeOutDir (the --out guard before rm -rf)", () => {
  it("allows seed/contentstack and other contentstack folders under seed/", () => {
    const root = repo();
    expect(assertSafeOutDir(join(root, "seed", "contentstack"), { root })).toBe(join(root, "seed", "contentstack"));
    expect(assertSafeOutDir("seed/contentstack", { root })).toBe(join(root, "seed", "contentstack"));
    expect(assertSafeOutDir(join(root, "seed", "copy", "contentstack"), { root })).toBe(join(root, "seed", "copy", "contentstack"));
  });

  it("allows a directory that doesn't exist yet, or an empty one, anywhere", () => {
    const root = repo();
    expect(() => assertSafeOutDir(join(root, "new-snapshot"), { root })).not.toThrow();
    mkdirSync(join(root, "empty"));
    expect(() => assertSafeOutDir(join(root, "empty"), { root })).not.toThrow();
  });

  it.each([
    ["the repo root", (root) => root],
    ["src/", (root) => join(root, "src")],
    ["seed/ itself", (root) => join(root, "seed")],
    ["a non-empty folder under seed/ not named contentstack", (root) => join(root, "seed", "lytics")],
    ["a contentstack folder outside seed/", (root) => join(root, "other", "contentstack")],
  ])("refuses %s when it has files (exit 2)", (_, pick) => {
    const root = repo();
    const dir = pick(root);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "keep.txt"), "x");
    expect(() => assertSafeOutDir(dir, { root })).toThrow(expect.objectContaining({ code: 2 }));
    expect(existsSync(join(dir, "keep.txt"))).toBe(true);
  });

  it("exportStack refuses before deleting anything", async () => {
    const root = repo();
    const dir = join(root, "src");
    mkdirSync(dir);
    writeFileSync(join(dir, "keep.txt"), "x");
    const cma = { get: async () => { throw new Error("no CMA call expected"); } };
    await expect(exportStack({ cma, outDir: dir, root })).rejects.toMatchObject({ code: 2 });
    expect(existsSync(join(dir, "keep.txt"))).toBe(true);
  });
});
