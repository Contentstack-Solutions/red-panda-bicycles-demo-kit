// The one Amsterdam BC member the demo signs in as. The email must match Sam's
// seeded Lytics profile exactly, or identify creates a separate profile.
export const DEMO_MEMBER = {
  firstName: "Sam",
  lastName: "Parker",
  // Set DEMO_PERSONA_EMAIL (lowercase, no "+") to the address seeded in Lytics.
  email: (process.env.DEMO_PERSONA_EMAIL || "sam.parker@example.com").trim().toLowerCase(),
};

// Lytics audience whose membership drives Sam's Personalize variants.
export const TARGET_AUDIENCE = "volt_owners_commuting";

// How long "Signing you in…" waits for the audience before returning anyway.
export const SIGN_IN_TIMEOUT_MS = 8000;

// How often to re-request the Lytics profile while waiting. The merge lands in
// under half a second, so this cadence is what the visitor waits on.
export const SIGN_IN_REFRESH_MS = 500;
