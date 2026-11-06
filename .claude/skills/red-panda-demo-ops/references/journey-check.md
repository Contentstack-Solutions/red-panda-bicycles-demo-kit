# Journey check: the persona's sign-in changes the hero

What a viewer sees: an anonymous visitor opens the homepage and gets the default hero. They click **Log into Amsterdam BC**, then **Continue** on the "Sign in with Google" screen. After a short "Signing you in…", they're back on `/en`, the header says **Hi, Sam**, and the hero is the personalized one: "For riders who've put in the miles", "Reliability and Range Above All.", **Meet the Roam**.

How it works:

1. The sign-in (`src/lib/clubSignIn.js`) identifies the browser to Lytics with the persona's email (`DEMO_PERSONA_EMAIL`), which merges this visitor into the persona's Lytics profile.
2. It re-reads the Lytics profile every 500 ms until the `cs-lytics-audiences` cookie contains `volt_owners_commuting`, giving up after 8 s (`src/lib/demoMember.js`).
3. Personalize Edge reads that cookie. Locally `src/middleware.ts` calls it; on Launch (`HOSTING=launch`) it's `functions/[proxy].edge.js`.
4. Personalize picks the variant of **Homepage – Reliability and range**, and the site fetches the hero entry with that variant.

## 1. Run `kit:verify` first

```
npm run kit:verify -- --site http://localhost:3000
```

(with the dev server running), or `npm run kit:verify` for the Launch site. It checks, without a browser, that an anonymous visitor gets the default hero, that a member of `volt_owners_commuting` gets the personalized one, and that the persona's profile (`seed-sam`) is in that audience. If a line fails, fix that first (see *Troubleshooting*); the browser check can't pass while it fails.

## 2. Local run, in the browser

1. Start the dev server: the `dev` configuration in `.claude/launch.json` (port 3000), or `npm run dev`. Open `http://localhost:3000/en` in the browser pane, or ask the SE to open it in a private window if this session has no browser.
2. **Start anonymous.** If the header shows "Hi, Sam", click **Sign out**. It clears the member, Lytics and Personalize cookies (`SIGN_OUT_COOKIES` in `src/lib/memberSession.js`). If the variant still shows after that, use a fresh private window.
3. **Baseline.** In the page, run:

   ```js
   const html = await fetch("/en", { cache: "no-store" }).then((r) => r.text());
   const text = new DOMParser().parseFromString(html, "text/html").body.textContent;
   ({ variant: text.includes("put in the miles"), audiences: document.cookie.match(/cs-lytics-audiences=([^;]*)/)?.[1] ?? null });
   ```

   Expect `variant: false`, and `audiences` missing or without `volt_owners_commuting`.
4. **Sign in.** Click **Log into Amsterdam BC**, then **Continue**. Time it: you should be back on `/en` with "Hi, Sam" well inside 8 s (under a second once the audience is built).
5. **After.** Run the snippet again. Expect `variant: true` and `audiences` containing `volt_owners_commuting`. Check the console for errors. Take a screenshot of the hero.
6. **Leave it clean.** Click **Sign out**, so the next run starts anonymous.

## 3. Launch run

Repeat section 2 on the Launch URL (`SITE_URL`), in a new tab. Launch runs the edge function instead of `src/middleware.ts`, so a local pass doesn't prove Launch works. Launch deploys what's on the branch it builds from, with its own environment variables.

Report which steps passed, with the sign-in time and the screenshot. Don't report a step as passed if it couldn't run.

## Troubleshooting

| Symptom | Likely cause | Check or fix |
|---|---|---|
| "Signing you in…" lasts the full 8 s, and there's no variant | The audience never reached the cookie | Is the persona in `volt_owners_commuting` (the `kit:verify` Lytics line)? Is the Lytics tag blocked (console warning, an ad blocker)? Does `DEMO_PERSONA_EMAIL` match the seeded profile exactly (lowercase, no `+`)? A brand-new or just-edited audience takes about 90 s to build its first membership. |
| The cookie has the audience, but the hero is the default | Personalize didn't pick the variant | Is the experience **active**, not a draft? Is the hero entry variant published to the environment the site reads (`CONTENTSTACK_ENVIRONMENT`)? Is the variant group linked to `hero_banner`? Is the `volt_owners_commuting` audience public in Lytics and synced into Personalize? Is there a stale `cs-personalize-manifest` (sign out and retry)? Check the dev server log for Personalize errors. |
| The browser and the `fetch` HTML disagree | A cached response | Use `cache: "no-store"`. Launch sends `cache-control: no-store` on proxied pages. |
| The anonymous baseline already shows the variant | The browser is still "Sam" (its Lytics ID was merged into the persona's profile) | Sign out, or use a fresh private window. |
| It works locally but not on Launch | Deployed code or environment variables differ | Is the change deployed? Are `HOSTING=launch`, `CONTENTSTACK_PERSONALIZATION`, `CONTENTSTACK_PERSONALIZE_EDGE_API_URL` and `CONTENTSTACK_ENVIRONMENT` right in Launch? Redeploy after any env change. |
| `kit:verify` counts are outside ±5% | Lytics recomputed, or something changed the audiences | Re-run in a few minutes. If a reset just ran, check it didn't remove a kit audience. Re-measuring is a decision for the SE. |
| `kit:verify` exits 2: "No measured counts" | `npm run kit:lytics` hasn't finished | Finish setup phase 4 (the `red-panda-setup` skill). |
