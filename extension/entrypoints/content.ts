// Phase 0: restricted to localhost so it only runs on fixture pages. Widened in Phase 3.
export default defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*"],
  runAt: "document_idle",
  main() {
    // Test hook only: lets the e2e smoke test confirm injection. Changes nothing visible.
    document.documentElement.dataset.anchorLoaded = "true";
  },
});
