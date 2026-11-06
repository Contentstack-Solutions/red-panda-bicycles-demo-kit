// Contentstack JSON RTE requires a uid and attrs on every element node.
// Article files are authored without them; this fills them in.
import { randomUUID } from "node:crypto";

export function withUids(node) {
  if (!node || typeof node !== "object" || !node.type) return structuredClone(node);
  return {
    ...node,
    uid: node.uid ?? randomUUID().replace(/-/g, ""),
    attrs: node.attrs ? structuredClone(node.attrs) : {},
    children: (node.children ?? []).map(withUids),
  };
}
