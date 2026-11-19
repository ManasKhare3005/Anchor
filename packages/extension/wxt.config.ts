import { defineConfig } from "wxt";

/**
 * Hard Rule 6: extension pages may load only their own files and may not open any network
 * connection. The strict policy applies to production builds; dev mode needs a WebSocket for
 * hot reload.
 */
export const STRICT_CSP =
  "default-src 'self'; script-src 'self'; object-src 'self'; connect-src 'none'";

export default defineConfig({
  manifest: ({ mode }) => ({
    name: "Anchor",
    description: "Keeps every website familiar. Your button is always where you left it.",
    permissions: ["storage", "sidePanel"],
    action: { default_title: "Open Anchor" },
    ...(mode === "production" ? { content_security_policy: { extension_pages: STRICT_CSP } } : {}),
  }),
  vite: () => ({
    // The module-preload polyfill calls fetch(); Chrome supports modulepreload natively.
    build: { modulePreload: { polyfill: false } },
  }),
});
