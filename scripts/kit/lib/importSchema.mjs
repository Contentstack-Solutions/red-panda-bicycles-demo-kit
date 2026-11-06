// Import handlers for the schema phases: locales, environments, taxonomies (with terms),
// global fields and content types. These keep their source UIDs (environments: names,
// locales: codes), so the pre-scan in importRun.mjs has already sorted every existing one
// into "ours" (recorded or pending in .kit/state.json), adopted (environments and locales
// the SE made) or a conflict (the run stopped).
// Each handler returns the step outcome: "created", "updated" or "skipped".
import { KitError } from "./env.mjs";
import { splitReferences } from "./importPlan.mjs";

const find = (list, pred, what) => {
  const hit = list.find(pred);
  if (!hit) throw new KitError(`Snapshot has no ${what}`, { code: 1, hint: "The snapshot is inconsistent; re-run the export." });
  return hit;
};

// An object that exists and is ours but isn't in state.created: its create response was lost
// last run (state.pending). Record it now instead of creating it again.
function adoptOurs(ctx, kind, key) {
  if (!ctx.created(kind).includes(key)) ctx.addCreated(kind, key);
  return "skipped";
}

// Parents before children, then by order; terms are created one by one.
function termsParentsFirst(terms) {
  const out = [];
  const seen = new Set();
  const byUid = new Map(terms.map((t) => [t.uid, t]));
  const visit = (t) => {
    if (seen.has(t.uid)) return;
    seen.add(t.uid);
    if (t.parent_uid && byUid.has(t.parent_uid)) visit(byUid.get(t.parent_uid));
    out.push(t);
  };
  terms.forEach(visit);
  return out;
}

async function createSchema(ctx, step, { label, kind, path, wrap, extra }) {
  const uid = step.key;
  if (ctx.existing.has(`${label}:${uid}`)) return adoptOurs(ctx, kind, uid);
  const src = find(ctx.snapshot[kind], (x) => x.uid === uid, `${label} ${uid}`);
  const { base } = splitReferences(ctx.schemas[kind][uid]);
  await ctx.creating(step, () => ctx.cma.post(path, { [wrap]: { uid, title: src.title, ...extra(src), schema: base } }));
  ctx.addCreated(kind, uid);
  ctx.existing.add(`${label}:${uid}`);
  return "created";
}

async function updateSchema(ctx, step, { kind, path, wrap, extra }) {
  const uid = step.key;
  const src = find(ctx.snapshot[kind], (x) => x.uid === uid, `${kind} ${uid}`);
  await ctx.cma.put(`${path}/${uid}`, { [wrap]: { uid, title: src.title, ...extra(src), schema: ctx.schemas[kind][uid] } });
  return "updated";
}

const GF = { label: "global_field", kind: "globalFields", path: "/global_fields", wrap: "global_field", extra: () => ({}) };
const CT = { label: "content_type", kind: "contentTypes", path: "/content_types", wrap: "content_type", extra: (c) => (c.options ? { options: c.options } : {}) };

export const SCHEMA_HANDLERS = {
  async locales(ctx, step) {
    const code = step.key;
    if (code === ctx.master) return "skipped"; // the stack's master, checked in the pre-scan
    if (ctx.existing.has(`locale:${code}`)) {
      if (ctx.created("locales").includes(code)) return "skipped";
      if (ctx.isPending(step)) return adoptOurs(ctx, "locales", code);
      if (!ctx.state.adopted.locales.includes(code)) ctx.state.adopted.locales.push(code);
      return "skipped";
    }
    const l = find(ctx.snapshot.locales, (x) => x.code === code, `locale ${code}`);
    const locale = { code, fallback_locale: l.fallback_locale ?? ctx.master, ...(l.name ? { name: l.name } : {}) };
    await ctx.creating(step, () => ctx.cma.post("/locales", { locale }));
    ctx.addCreated("locales", code);
    return "created";
  },

  async environments(ctx, step) {
    const name = step.key;
    const { state } = ctx;
    if (ctx.envExisting.has(name)) {
      if (state.created.environments.includes(name)) return "skipped";
      if (ctx.isPending(step)) return adoptOurs(ctx, "environments", name);
      if (!state.adopted.environments.includes(name)) state.adopted.environments.push(name);
      return "skipped";
    }
    const environment = { name, urls: [{ locale: ctx.master, url: ctx.siteUrl }] };
    await ctx.creating(step, () => ctx.cma.post("/environments", { environment }));
    ctx.addCreated("environments", name);
    ctx.envExisting.add(name);
    return "created";
  },

  async taxonomies(ctx, step) {
    const uid = step.key;
    const { cma, state } = ctx;
    const t = find(ctx.snapshot.taxonomies, (x) => x.taxonomy.uid === uid, `taxonomy ${uid}`);
    let outcome;
    if (ctx.existing.has(`taxonomy:${uid}`)) {
      outcome = adoptOurs(ctx, "taxonomies", uid);
    } else {
      const { name, description } = t.taxonomy;
      await ctx.creating(step, () => cma.post("/taxonomies", { taxonomy: { uid, name, ...(description ? { description } : {}) } }));
      ctx.addCreated("taxonomies", uid);
      ctx.existing.add(`taxonomy:${uid}`);
      delete state.pending;
      ctx.save();
      outcome = "created";
    }
    // Terms: each recorded as it lands. In a taxonomy from an earlier run, look before creating.
    const done = (state.progress["taxonomies:terms"] ??= {});
    for (const term of termsParentsFirst(t.terms ?? [])) {
      const key = `${uid}/${term.uid}`;
      if (done[key]) continue;
      const exists = outcome !== "created" && (await cma.get(`/taxonomies/${uid}/terms/${term.uid}`)) !== null;
      if (!exists) {
        const body = { uid: term.uid, name: term.name };
        if (term.parent_uid) body.parent_uid = term.parent_uid;
        if (typeof term.order === "number") body.order = term.order;
        await cma.post(`/taxonomies/${uid}/terms`, { term: body });
      }
      done[key] = true;
      ctx.save();
    }
    return outcome;
  },

  "globalFields:base": (ctx, step) => createSchema(ctx, step, GF),
  "contentTypes:base": (ctx, step) => createSchema(ctx, step, CT),
  "globalFields:full": (ctx, step) => updateSchema(ctx, step, GF),
  "contentTypes:full": (ctx, step) => updateSchema(ctx, step, CT),
};

// Dry-run outcomes: what each handler would report, from the pre-scan alone.
const existsOr = (label) => (ctx, step) => (ctx.existing.has(`${label}:${step.key}`) ? "skipped" : "created");
export const SCHEMA_OUTCOMES = {
  locales: (ctx, step) => (step.key === ctx.master ? "skipped" : existsOr("locale")(ctx, step)),
  environments: (ctx, step) => (ctx.envExisting.has(step.key) ? "skipped" : "created"),
  taxonomies: existsOr("taxonomy"),
  "globalFields:base": existsOr("global_field"),
  "contentTypes:base": existsOr("content_type"),
  "globalFields:full": () => "updated",
  "contentTypes:full": () => "updated",
};
