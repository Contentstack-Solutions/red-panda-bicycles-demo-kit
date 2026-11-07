# Live-run checklist

This checklist is for the maintainer's first live run. SEs can ignore it.

For the maintainer's first run against real accounts. Everything in the kit was built and tested against fakes. The assumptions below were never checked against the real services. Work through them while you run setup in a scratch org, and tick each one off or fix the code.

Each item says what the code expects and what you'll see if it's wrong. Fixes are usually small, but write down anything you change.

## Before you start

You need a scratch org with:

- an empty stack whose master language is English (en)
- RP Commerce installed
- a Personalize project connected to a sandbox Lytics account
- Brand Kit enabled
- a Launch project

Lytics profiles and events can't be deleted through the API, so use a sandbox account.

## Run order

1. Setup through every phase (the `red-panda-setup` skill).
2. `npm run kit:verify`, locally and then on Launch.
3. `npm run kit:reset -- --yes`, then `npm run kit:verify` again. It should still pass.
4. `npm run kit:teardown` (dry run). Check the plan covers everything in `.kit/state.json`.
5. `npm run kit:teardown -- --yes`.
6. Run setup a second time. Teardown archived `.kit/state.json`, so this is a fresh setup: every phase recreates what teardown removed (it should succeed, not report "skipped"). Then run each kit command once more: that run should report "skipped" and make no writes.

Expected results to confirm along the way:

- Anonymous visitors see the base hero. The persona sees "Reliability".
- Audience counts are recorded in `.kit/state.json`.
- Brand Kit has 15 vault items and 2 profiles.
- Every manual step the setup skill asks for is in `docs/manual-steps.md`.
- The persona sign-in path in `docs/demo-script.md` ("Sign in with Google", then Continue) matches the real screens.

## Keys and doctor

- The auth header for Lytics is a guess: `Authorization: <token>`. Check that `npm run kit:doctor -- --phase lytics` passes with a real token.
- The region and host defaults in `.env.example`, and the Personalize edge URL example, are from memory of the Contentstack docs. Check them for your region.
- `RED_PANDA_COMMERCE_STPRE_TOKEN` is in the browser bundle on purpose. The client cart (`src/context/cart.context.js`) sends it from the browser, and `next.config.ts` has a comment saying so. It is a read-only storefront token, not a write token, so this is accepted. No action needed. Management and write tokens must never go in that `env` block.
- The Brand Kit phase has only a Node, env and region-hosts check in doctor, no check against the API.
- Non-US regions: `CONTENTSTACK_PERSONALIZE_API_HOST`, `CONTENTSTACK_BRANDKIT_API_HOST` and `CONTENTSTACK_AI_HOST` override the US Personalize, Brand Kit and AI hosts. Only the US defaults have been used. Doctor shows a `!` warning (exit 0) when `CONTENTSTACK_REGION` isn't `us` and they're blank.
- `npm run kit:doctor -- --phase site` passes only when `CONTENTSTACK_PERSONALIZATION` holds the Personalize project UID. Check the deployed site picks it up from Launch's environment variables (the site falls back to `CONTENTSTACK_PERSONALIZE_PROJECT_UID` when it's blank or `true`).

## Commerce

- `npm run kit:doctor -- --phase commerce` passes with a real RP Commerce install. It first checks the app's extension titles. Then it requests `/api/public/store/<id>/categories/categoryByUrl?url=/e-bikes` and expects a 200.
- That request sends the store token in both the `Authorization` and `x-store-token` headers, as `src/lib/rpcommerce.js` does. Pass: "store reachable". A 401 or 403 means the headers are wrong for your store.

- Checkout with a real store: add the Roam (its button says "Pre-order") and check out. The store's `/embed/checkout` page loads inside the site's overlay (the store allows framing), the email is prefilled for a signed-in member, the order completes, and the overlay closes on "Continue shopping". Afterwards Lytics shows an `rp_orders` event with `action: "preorder"` for that visitor, the store's purchase event arrives through the site's tag, and `kit:verify -- --counts` shows `roam_preorder` one higher (allow for Lytics processing time).

## Without RP Commerce (`kit:import -- --without-commerce`)

- `POST /v3/extensions` with `{extension:{title, type:"field", data_type:"json", multiple:false, config:{}, srcdoc}}` creates the two stand-in fields (from the management SDK's docs; not yet run against a real stack). Content types and global fields that reference them save, and entries keep their saved product JSON.
- In the entry editor, a stand-in field shows the saved product names read-only, and saving the entry keeps the field's value.
- `kit:teardown` deletes the stand-ins (`DELETE /v3/extensions/{uid}`) after the content types and global fields.

## Contentstack import (`kit:import`)

Stack and locales

- `GET /v3/locales` returns the master language with `fallback_locale` empty or missing. `GET /v3/stacks` returns `stack.master_locale`.
- `GET /v3/extensions?include_marketplace_extensions=true` lists the RP Commerce field extensions by `title`.
- `POST /v3/locales` with `{locale:{code:"nl", name:"Dutch", fallback_locale:"en"}}` works.
- `GET /v3/environments/{name}` gives 404 or 422 when the environment is missing. `POST /v3/environments` with `{environment:{name, urls:[{locale:"en", url}]}}` works.

Schema

- `POST /v3/taxonomies` with `{taxonomy:{uid,name,description}}` works. `POST /v3/taxonomies/{uid}/terms` with `{term:{uid,name,parent_uid?,order?}}` works. A missing term returns 404 or 422.
- `POST /v3/global_fields` and `POST /v3/content_types` accept the base schema. A later PUT with the full schema adds the references. No nested global fields exist, so the `api_version: 3.2` header is not needed.

Assets and entries

- `POST /v3/assets/folders` with `{asset:{name, parent_uid}}` returns `{asset:{uid}}`. `POST /v3/assets` (multipart) returns `{asset:{uid, url}}`.
- `POST /v3/content_types/{ct}/entries?locale=en` creates an entry. `PUT .../entries/{uid}?locale=nl` localizes it.
- The recovery queries (they only run after a create was lost):
  - entries by `title`
  - assets by `filename` and `parent_uid`
  - folders by `name`
- Nested block `_metadata: {uid}` objects inside entries are accepted, or regenerated, by the API.
- Dangling references: a handful of snapshot entries point at entries that no longer exist in the source stack. Confirm the import warns about them and prunes them.

Publishing

- Entry publish body `{entry:{environments:[names], locales}}` and asset publish body `{asset:{environments:[names], locales}}` work with environment names. Check that the asset publish accepts `nl`.

Re-run

- A second `kit:import` is all "skipped" with zero writes.
- With none of the publish environments in the stack, the import exits 2 ("nothing was published") and leaves `phases.contentstack` unset. After creating the environment, a re-run publishes and finishes.
- Pointing the import at a stack that already has content stops with exit 3 and lists the conflicts.

## Lytics (`kit:lytics`)

- `/v2/segment` returns `{data:[{id,slug_name}]}` in one page. The audience scan returns `total` (or `data.total`).
- `GET /api/account/setting/api_whitelist_fields` returns the current list as a bare array, or under `data` or `data.value` (or `value`); a 404 or `null` is read as "never set". Any other shape stops the phase before the PUT ("unexpected response"). Note what the real response looks like.
- `PUT` on the account settings accepts the bare array: the union of the account's current list and `seed/lytics/account-settings.json`. `.kit/state.json` records the account's own list under `lytics.previousWhitelist`.
- A Lytics audience with a kit slug that the kit didn't create: same definition is adopted with no write; a different definition stops the audiences step with exit 3 and nothing written.
- Model health: both lookalike models print a health value. A low-confidence model may print none, and then the phase ends with a warning, not a failure.
- The size wait needs all six audiences above zero. If one is legitimately zero on your data, the step times out after 15 minutes (exit 1).
- Tolerance: the recorded counts under `expected` match later `kit:verify -- --counts` output within 5%.

## Personalize (`kit:personalize`)

- `personalize-audiences` returns the synced Lytics audiences with `source: "LYTICS"`. Their `slug` or `name` matches `volt_owners_commuting`. If the source comes back in another form, the wait times out.
- Personalize mirrors the variant into the stack within 45 seconds. If it's slower, step 4 fails with exit 1 ("hasn't synced yet"). A re-run resumes at step 4.
- The imported `hero_banner` was published to `CONTENTSTACK_PUBLISH_ENVIRONMENTS` and not edited since. If it was, step 5 exits 3.
- The names in `CONTENTSTACK_PUBLISH_ENVIRONMENTS` exist in the stack.
- `PUT /api/segment/{id}` with `is_public:true` makes the audience visible to Personalize within 5 minutes.
- An expired session shows up as a 401 from Personalize, or error 105 from the stack API when no management token is set. Both stop with exit 2 and the `rp.mjs login` hint.
- The variant-group response is shaped like `variant_groups[].variants[]`. The entry variants response uses the key `entries`, falling back to `variants`, and accepts `locale`. If the names live elsewhere, experience and variant names show as empty.
- `include_publish_details=true` on entry lists fills in `publish_details[{environment, locale}]`.
- The `/extensions` list from the marketplace may return app-installed field extensions in a different shape.
- A folder listing with `include_folders=true` and `query={"is_dir":true}` returns folders under `assets`, and a plain asset listing leaves folders out.
- List keys: `/taxonomies` returns `taxonomies` and terms return `terms`. `/locales` returns `locales[{code,name,fallback_locale}]`.

## Brand Kit (`kit:brandkit`)

- Knowledge Vault: `get-context` returns an array, or an object holding the array under `items`, `contexts`, `contents`, `data` or `results`. Each item has its id in `uid`, `_id` or `id` and its title in `_metadata.title` (or `title`). If the title lives elsewhere, the title wait times out after 60 seconds (exit 1) after the PUT.
- Creating an item returns a uid (`uid`, `_id` or `id`, possibly under `data`). If not, the phase finds the one new uid in the list.
- Creating an item ignores the title. A PUT sets it afterwards, and the update is asynchronous, so the phase waits for the title to appear.
- The vault list uses `limit=50` with no paging. A kit with more than 50 existing items would not see every title.
- Voice profiles: the list is under `profiles` or `items` (or is a bare array). Creating one returns `profile.uid` or `uid`. Templates sit under `templates` or `profile_templates`, with a `name` or `type` containing "voice".
- Headers `authtoken`, `organization_uid` and `brand_kit_uid` go on every call, plus `version: v2` on the v2 profile calls.
- OAuth: the setup skill describes sending an OAuth user token as `Authorization: Bearer`. This was only tested against a fake. Also confirm which OAuth app and scopes an SE needs. If the `authtoken` header is rejected, the run stops with exit 2.

## Run and verify

- Sending the `cs-lytics-audiences` cookie to `/en` makes Launch serve the variant on the server. This is the approach `kit:verify` uses. The cookie-only path hasn't been tried.
- The personalize response carries `data.segments`.
- Sam's membership is checked through the public personalize endpoint, which needs `LYTICS_TAG`. Launch may serve a stale cached page. Test: change the persona's audience membership, run `npm run kit:verify -- --site <launch url>`, and check the result matches the new state. Pass if verify reports the change within a minute or two. Fail if it keeps reporting the old hero.
- Act 1 Q1 to Q3: the saved funnel audiences (`near_amsterdam`, `near_amsterdam_volt_owners`, `near_amsterdam_volt_commuters`) count correctly through `lytics-audience-size`. Q2 and Q3 use a "now minus one year" window, so the counts drift over time.

## Reset (`kit:reset`)

- Entry variants are found only on entries the kit created (`state.created.entries`), for content types linked to the experience's variant group. Variants on entries someone added by hand are not unpublished one by one.
- Each variant unpublish waits up to 30 seconds.
- Lytics audience `created` timestamps are on the `/api/segment` items.
- Personalize experiences carry a creation time under `createdAt` (or a fallback name). If the field is named differently, every experience is flagged "no timestamp" and none is deleted. That fails safe.

## Tear-down (`kit:teardown`)

Brand Kit

- Vault items delete with `DELETE {vaultBase()}/{uid}` (`scripts/kit/lib/brandkitPhase.mjs`), the same path the setup PUT uses.
- Profiles delete with `DELETE {profilesApi()}/brand-kits/{BRAND_KIT_UID}/profiles/{uid}` and the `version: v2` header.
- A wrong path stops the run and leaves the item listed. It is never recorded as deleted.

Personalize

- Events delete with `DELETE /events/{uid}`, using the uid from `GET /events`.

Stack

- The entry unpublish body is `{entry:{environments, locales}}`.
- Teardown unpublishes each entry only in the locales it has (from the import record). Check that no entry fails to unpublish, including an entry that exists only in `en`.
- `delete_all_localized=true` works on entry delete.
- Folders delete with `DELETE /assets/folders/{uid}`. Locales delete with `DELETE /locales/{code}`.
- The folder contents query is `GET /assets?include_folders=true&query={"parent_uid":"<folder>"}`. The entry query uses `include_count`, `limit` and `skip`.
- Variant groups go through the stack API with the management token.

Lytics

- The last step restores `api_whitelist_fields` to `lytics.previousWhitelist` with a bare-array PUT. Check that Lytics accepts it, including an empty array when the setting was never set before setup.
- Content types that reference each other are deleted in reverse order. If one is refused, teardown stops at that step.

Things that must be left alone (adopted)

Set these up before running setup, then check each survives teardown. Each should appear under "By hand" in the dry run and stay in your account after `--yes`.

- A Lytics audience with the same slug and definition as a kit audience (for example `roam_intent`). Setup records it as adopted (`state.adopted.lyticsAudiences`). Teardown deletes only `state.created.lyticsAudiences`. With a different definition, setup stops with exit 3 instead.
- A Brand Kit vault item and a voice profile with the same titles as the kit's. Setup records them in `state.brandkit.adopted`.
- A Personalize experience with the kit's name. Setup marks it `adopted: true`, and teardown turns it into a manual step. Its variant group and variants are left too.

Known limits to watch for

- Lytics may refuse to delete an audience that a lookalike model uses. Delete the models first, then re-run.
- On a stack that has other content, the `nl` language is kept and listed as a manual step.
