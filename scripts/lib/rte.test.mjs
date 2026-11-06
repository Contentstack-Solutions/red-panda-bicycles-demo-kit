import { describe, expect, it } from "vitest";
import { withUids } from "./rte.mjs";

const doc = {
  type: "doc",
  children: [
    { type: "h2", children: [{ text: "Title" }] },
    { type: "p", children: [{ text: "Hi ", bold: true }, { type: "a", attrs: { url: "/en/blog" }, children: [{ text: "link" }] }] },
    { type: "ul", uid: "0123456789abcdef0123456789abcdef", children: [{ type: "li", children: [{ text: "one" }] }] },
  ],
};

describe("withUids", () => {
  it("adds uids and attrs to every element node without touching leaves", () => {
    const out = withUids(doc);
    const nodes = [];
    const walk = (n) => { if (n.type) nodes.push(n); (n.children ?? []).forEach(walk); };
    walk(out);
    expect(nodes).toHaveLength(6);
    expect(nodes.every((n) => /^[0-9a-f]{32}$/.test(n.uid))).toBe(true);
    expect(new Set(nodes.map((n) => n.uid)).size).toBe(6);
    expect(nodes.every((n) => n.attrs && typeof n.attrs === "object")).toBe(true);
    expect(out.children[1].children[0]).toEqual({ text: "Hi ", bold: true });
  });

  it("keeps existing uids and attrs", () => {
    const out = withUids(doc);
    expect(out.children[2].uid).toBe("0123456789abcdef0123456789abcdef");
    expect(out.children[1].children[1].attrs).toEqual({ url: "/en/blog" });
  });

  it("does not mutate the input", () => {
    const copy = structuredClone(doc);
    withUids(doc);
    expect(doc).toEqual(copy);
  });
});
