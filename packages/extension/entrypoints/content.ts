import { pagePatternOf, registrableDomain } from "@anchor/matcher";
import {
  ContentRequestSchema,
  isPing,
  type PageEvent,
  type PingReply,
  type WhereReply,
} from "../src/messages.ts";
import { removeOverlay } from "../src/content/overlay.ts";
import { startPicking, stopPicking } from "../src/content/pick.ts";
import { point, stopPointing } from "../src/content/point.ts";
import { startRecording, stopRecording } from "../src/content/record.ts";

// Restricted to fixture origins for now; widened per site later.
// Hard Rule 4: everything Anchor shows lives in one Shadow DOM host marked data-anchor, and
// "Show original" removes it.
export default defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*"],
  runAt: "document_idle",
  main() {
    const send = (event: PageEvent) => void browser.runtime.sendMessage(event).catch(() => {});

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isPing(message)) {
        const reply: PingReply = { ok: true };
        return Promise.resolve(reply);
      }
      const req = ContentRequestSchema.safeParse(message);
      if (!req.success) return undefined;
      const r = req.data;
      switch (r.type) {
        case "anchor:where": {
          const reply: WhereReply = {
            site: registrableDomain(location.href),
            pagePattern: pagePatternOf(location.href),
          };
          return Promise.resolve(reply);
        }
        case "anchor:pick-start":
          stopPointing();
          startPicking(document, {
            onPicked: (fingerprint) => send({ type: "anchor:picked", fingerprint }),
            onCancelled: () => send({ type: "anchor:pick-cancelled" }),
          });
          return Promise.resolve({ ok: true });
        case "anchor:pick-stop":
          stopPicking();
          return Promise.resolve({ ok: true });
        case "anchor:find":
          stopPicking();
          return Promise.resolve(point(document, r.fingerprint, r.siteButtons));
        case "anchor:record-start":
          stopPicking();
          stopPointing();
          startRecording(document, r.afterInput, (step) => send({ type: "anchor:recorded", step }));
          return Promise.resolve({ ok: true });
        case "anchor:record-stop":
          stopRecording();
          return Promise.resolve({ ok: true });
        case "anchor:show-original":
          stopPicking();
          stopPointing();
          stopRecording();
          removeOverlay();
          return Promise.resolve({ ok: true });
        default:
          return undefined;
      }
    });
  },
});
