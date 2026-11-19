// Runs the e2e suite in installed Microsoft Edge instead of bundled Chromium.
// (Setting env vars inline isn't portable between cmd.exe and POSIX shells.)
import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync("npx", ["playwright", "test"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ANCHOR_E2E_CHANNEL: "msedge" },
});
process.exit(result.status ?? 1);
