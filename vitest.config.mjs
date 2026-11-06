import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // rp.mjs fills unset env vars from the repo's .env.local; tests opt in with a fixture instead.
    env: { RP_REPO_ENV_FILE: "" },
    include: ["src/**/*.test.js", "scripts/**/*.test.mjs", ".claude/skills/**/*.test.mjs"],
  },
});
