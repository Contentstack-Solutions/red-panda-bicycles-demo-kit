import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { personalizeProjectUid } from "./personalizeProject.js";

describe("personalizeProjectUid (ruling R37)", () => {
  it("uses CONTENTSTACK_PERSONALIZATION when it holds a project UID", () => {
    expect(personalizeProjectUid({ CONTENTSTACK_PERSONALIZATION: " proj123 ", CONTENTSTACK_PERSONALIZE_PROJECT_UID: "other" })).toBe("proj123");
  });

  it.each([undefined, "", "  ", "true", "TRUE", "null", "undefined"])(
    "falls back to CONTENTSTACK_PERSONALIZE_PROJECT_UID when CONTENTSTACK_PERSONALIZATION is %j",
    (value) => {
      expect(personalizeProjectUid({ CONTENTSTACK_PERSONALIZATION: value, CONTENTSTACK_PERSONALIZE_PROJECT_UID: " proj456 " })).toBe("proj456");
    },
  );

  it("returns null when neither holds a project UID", () => {
    expect(personalizeProjectUid({ CONTENTSTACK_PERSONALIZATION: "true" })).toBeNull();
    expect(personalizeProjectUid({})).toBeNull();
    expect(personalizeProjectUid()).toBeNull();
  });
});

describe("site reads of the project UID", () => {
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return files(p);
    return /\.(js|jsx|ts|tsx)$/.test(d.name) && !/\.test\./.test(d.name) ? [p] : [];
  });

  it("every file that reads CONTENTSTACK_PERSONALIZATION from the environment resolves it with personalizeProjectUid", () => {
    const offenders = [...files("src"), ...files("functions")].filter((p) => {
      const text = readFileSync(p, "utf8");
      const reads = /(?:process\.env|context\.env)\.CONTENTSTACK_PERSONALIZATION\b/.test(text);
      return reads && !text.includes("personalizeProjectUid(");
    });
    expect(offenders).toEqual([]);
  });
});

