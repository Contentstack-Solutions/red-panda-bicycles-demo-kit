import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKitState, saveKitState, recordCreated } from "./state.mjs";

describe("kit state", () => {
  it("saveKitState round-trips and leaves no temp file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-"));
    const path = join(dir, "sub", "state.json");
    const empty = loadKitState(path);
    expect(empty).toEqual({ version: 1, uidMap: {}, assets: {}, created: {}, phases: {} });
    recordCreated(empty, "entries", "home", { uid: "blt1" });
    saveKitState(empty, path);
    expect(loadKitState(path).created.entries.home).toEqual({ uid: "blt1" });
    expect(readdirSync(join(dir, "sub"))).toEqual(["state.json"]);
  });
});
