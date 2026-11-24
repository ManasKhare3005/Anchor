import { pagePatternOf, registrableDomain } from "@anchor/matcher";
import {
  ContentRequestSchema,
  type ContentRequest,
  isPing,
  type PageEvent,
  type PingReply,
  type WhereReply,
} from "../src/messages.ts";
import { adaptFromStore, adaptPause, adaptShow } from "../src/content/adapt/run.ts";
import { removeOverlay } from "../src/content/overlay.ts";
import { startPicking, stopPicking } from "../src/content/pick.ts";
import { guide, stopGuiding } from "../src/content/guide.ts";
import { point, stopPointing } from "../src/content/point.ts";
import { startRecording, stopRecording } from "../src/content/record.ts";
import { STORE_KEY, parseStore } from "../src/store.ts";

// Restricted to fixture origins for now; widened per site later.
// Hard Rule 4: everything Anchor shows lives in Shadow DOM hosts marked data-anchor, Adapt's
// styles in one marked <style>, and "Show original" removes all of it.
// document_start: Adapt's stylesheet lands before the first paint, so the page doesn't jump.
export default defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*"],
  runAt: "document_start",
  main() {
    const send = (event: PageEvent) => void browser.runtime.sendMessage(event).catch(() => {});

    const readStore = async () => {
      const parsed = parseStore((await browser.storage.local.get(STORE_KEY))[STORE_KEY]);
      adaptFromStore(document, parsed.ok ? parsed.store : null);
    };
    void readStore();
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && STORE_KEY in changes) void readStore();
    });

    // Everything else works on the page itself: wait until it has been parsed.
    const ready = new Promise<void>((ok) => {
      if (document.readyState !== "loading") ok();
      else document.addEventListener("DOMContentLoaded", () => ok(), { once: true });
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isPing(message)) {
        const reply: PingReply = { ok: true };
        return Promise.resolve(reply);
      }
      const req = ContentRequestSchema.safeParse(message);
      if (!req.success) return undefined;
      return ready.then(() => handle(req.data));
    });

    function handle(r: ContentRequest): unknown {
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
          stopGuiding();
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
          stopGuiding();
          return Promise.resolve(point(document, r.fingerprint, r.siteButtons));
        case "anchor:guide-step":
          stopPicking();
          stopPointing();
          stopRecording();
          return Promise.resolve(guide(document, r, send));
        case "anchor:guide-stop":
          stopGuiding();
          removeOverlay();
          return Promise.resolve({ ok: true });
        case "anchor:record-start":
          stopPicking();
          stopPointing();
          stopGuiding();
          startRecording(document, r.afterInput, (step) => send({ type: "anchor:recorded", step }));
          return Promise.resolve({ ok: true });
        case "anchor:record-stop":
          stopRecording();
          return Promise.resolve({ ok: true });
        case "anchor:show-original":
          stopPicking();
          stopPointing();
          stopRecording();
          stopGuiding();
          removeOverlay();
          adaptPause();
          return Promise.resolve({ ok: true });
        case "anchor:adapt-show":
          adaptShow(document, r.settings);
          return Promise.resolve({ ok: true });
        default:
          return undefined;
      }
    }
  },
});
