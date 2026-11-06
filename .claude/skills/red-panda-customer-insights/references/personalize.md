# Personalize: experiences and variants

The Personalize project is connected to the Lytics account (the helper knows which project; you don't need its ID), and public Lytics audiences sync into it automatically as audiences with source "Lytics". You don't need to create a separate Personalize audience.

Every helper command is safe to rerun: it finds what already exists and carries on from there.

**Setting up personalization is steps 1 and 2 only.** Steps 3 and 4 change content, and happen only when the person explicitly asks for that content change (see *Content changes* in SKILL.md). Never go on to them just because the experience is set up.

## 1. Make the audience public

Personalize can only target public Lytics audiences. Create it with `"is_public": true` (`lytics-create-audience`), or make an existing one public:

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs lytics-update-audience <<'JSON'
{"audience": "roam_commuter_campaign", "is_public": true}
JSON
```

## 2. Create the experience

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs personalize-create-experience <<'JSON'
{"name": "Roam Commuter Campaign", "audience": "roam_commuter_campaign"}
JSON
```

- `name`: what the person asked for.
- `audience`: the Lytics audience slug (or its name).
- `content_type` (optional): include it only when the person names the content type the variant changes. Otherwise leave it out; `cms-create-variant` links the content type when content is written.
- For several audiences, pass `"variants": [{"name": "…", "audience": "…"}, …]` instead of `audience`.

The result lists each variant's `targets` (the Lytics audience ID it serves) and `cms_variant_uid`. It waits for the audience to sync into Personalize (up to 3 minutes; it's usually there within 1–2 minutes of being made public), creates a Segmented experience, sets one variant per audience, **activates it**, waits for the variants to appear in the stack, and links the content type to the experience's variant group. If it stops with "Audience not in Personalize yet", run the same command again after a minute.

Pass `"activate": false` to leave it as a draft, then `personalize-set-status "<name>" ACTIVE` later. A draft experience never serves.

**Stop here.** Reply with exactly one line, "Done: **[experience]** is active for **[audience]**.", with no IDs or extra notes, and wait. Go on to steps 3 and 4 only if the person explicitly asks for a content change.

## Changing a live experience ("create variant")

Status lives on the version, not the experience; the experience's status is just a rollup of its versions' states. So you never edit an active experience directly. Every change goes through a draft/activate cycle:

1. **Create a draft**: `POST /experiences/{uid}/versions` with `"status": "DRAFT"`. Only one draft can exist per experience at a time.
2. **Edit the draft**: make the changes (variants, targeting, metrics, split) with `PUT /experiences/{uid}/versions/{versionUid}` while it's still `DRAFT`. The live version is untouched meanwhile.
3. **Activate the draft**: the same `PUT` with `"status": "ACTIVE"`. This archives the previously active version automatically; there's no separate archive step.

Other transitions:
- **ACTIVE → PAUSED**: the same `PUT` with `"status": "PAUSED"` (`personalize-set-status "<name>" PAUSED`). It's temporary and archives nothing; visitors see the base entry while it's paused.
- **ACTIVE/PAUSED → ARCHIVED**: retires the version permanently.

To change what a live experience does, don't update it in place: draft, edit, activate. When someone says "create variant", make the audience public first (step 1; safe to rerun), then the helper runs all three steps:

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs personalize-add-variant <<'JSON'
{"experience": "Roam Commuter Campaign", "audience": "roam_intent"}
JSON
```

- `experience`: the experience's name or uid. `audience`: the Lytics audience slug or name. It must be public (step 1).
- `name` (optional): the variant's name; it defaults to the audience's name.
- `"activate": false` stops after step 2 and leaves the draft for someone to review.

It keeps every existing variant as it is, so content already on them stays, and it returns `status: "activated"` with the version it archived. `status: "exists"` means a variant already targets that audience, so nothing changed. **Exit code 3** means nothing changed and a person has to decide: either the variant name is taken, or the experience already has a draft with other unsaved changes (someone may be editing it in Personalize; activating would publish their changes too). Say which in one line and ask.

Then reply with exactly one line: "Done: **[experience]** now has a variant for **[audience]**." Write entry-variant content (step 3) only if they also ask for specific content.

## 3. Create the entry variant (only when explicitly asked)

Do this only when the person asks for specific content, such as "change the headline for this audience to …". Use their exact wording. If they ask for content without giving the wording, suggest it in the chat and wait for approval before saving.

The variant goes on the entry the person names. If they haven't said which entry, ask. Find its content type and UID with the `Red Panda Insights` tools (`get_all_content_types`, `get_all_entries`); if they aren't available, ask for them. Before writing, read the base entry's current values (`node .claude/skills/red-panda-customer-insights/scripts/rp.mjs cms-entry <content_type> <entry uid>`) so the new copy fits its fields.

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs cms-create-variant <<'JSON'
{"content_type": "<content_type>", "entry": "<entry uid>", "experience": "Roam Commuter Campaign",
 "fields": {"<field>": "…"}}
JSON
```

Put **only the fields that change** in `fields`; everything else inherits from the base entry. If the experience has more than one variant, add `"variant": "<variant name>"`.

## 4. Publish the variant (only when explicitly asked)

Only when the person asks for the content to be published or to go live.

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs cms-publish-variant <<'JSON'
{"content_type": "<content_type>", "entry": "<entry uid>", "experience": "Roam Commuter Campaign"}
JSON
```

It publishes to the site's environments and waits until the variant is live (`status: "published"`). Publishing a variant also publishes the base entry's latest version if the base has unpublished changes, so the helper checks first. **Exit code 3** means the base has unpublished edits and nothing was published: say so in one line and ask. Rerun with `"allow_base_draft": true` only if they say the base changes can go live.

After publishing, confirm in one line: "Live: [experience name] shows [what changed] to [audience]."

## Events

To track impressions and conversions, create the event keys (existing ones are left alone):

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs personalize-create-events <<'JSON'
{"events": [{"key": "preorder_completed", "description": "Roam pre-order placed"}]}
JSON
```

## Undoing

In this order:

1. `cms-unpublish-variant`, with the same body as `cms-publish-variant`. It waits until the variant is offline (`status: "unpublished"`).
2. `cms-delete-variant`, again with the same body.
3. `personalize-delete-experience "<name>"`. This also removes the experience's variant group from the stack.
4. If the audience was made for this, `lytics-delete-audience <slug>`. Personalize drops its synced copy automatically.

To pause instead of deleting: `personalize-set-status "<name>" PAUSED`.

## If a command fails

- **401 from Personalize:** the Contentstack authtoken has expired. The person runs `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login` in Terminal (it asks for their password and 2FA code), then rerun.
- **"Variant … hasn't synced to the stack yet":** wait a few seconds and rerun.
- **The helper is missing:** say so in one line, and give the settings so someone can do it in the Personalize UI: type Segmented, the name, one variant targeting the synced Lytics audience, the content type if the person named one, then activate it.
