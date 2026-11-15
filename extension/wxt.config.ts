import { defineConfig } from "wxt";

// See DECISIONS.md D-002 (WXT) and D-008 (permissions).
export default defineConfig({
  manifest: {
    name: "Anchor",
    description: "Keeps every website familiar. Your button is always where you left it.",
    permissions: ["storage"],
  },
});
