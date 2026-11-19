import { isPing, type PingReply } from "../src/messages.ts";

// M0: restricted to localhost so it only runs on fixture pages. Widened per site later.
// Hard Rule 4: this script must not change the page. Everything Anchor shows later lives in a
// Shadow DOM host marked data-anchor.
export default defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isPing(message)) return undefined;
      const reply: PingReply = { ok: true };
      return Promise.resolve(reply);
    });
  },
});
