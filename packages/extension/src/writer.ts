import { ShelfRequestSchema, type ShelfReply } from "./messages.ts";
import {
  STORE_KEY,
  StoreError,
  addButton,
  addRoute,
  parseStore,
  removeButton,
  removeRoute,
  renameButton,
  setAdapt,
  type Store,
} from "./store.ts";

/** The part of chrome.storage.local the writer needs (a fake in unit tests). */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/**
 * Who sent a message. Only Anchor's own pages (the side panel) may write. Content scripts share
 * the extension id but report the web page's URL, so they are refused.
 */
export interface Sender {
  id?: string;
  url?: string;
}

/**
 * The single writer for the shelf. Requests are applied one at a time (each read-modify-write
 * finishes before the next starts), so two quick saves can't overwrite each other.
 */
export function createWriter(area: StorageArea, extensionId: string, extensionOrigin: string) {
  let queue: Promise<unknown> = Promise.resolve();

  async function apply(change: (s: Store) => Store): Promise<ShelfReply> {
    const parsed = parseStore((await area.get(STORE_KEY))[STORE_KEY]);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    let next: Store;
    try {
      next = change(parsed.store);
    } catch (e) {
      if (e instanceof StoreError) return { ok: false, error: e.message };
      return { ok: false, error: "invalid data" };
    }
    await area.set({ [STORE_KEY]: next });
    return { ok: true };
  }

  return function handle(message: unknown, sender: Sender): Promise<ShelfReply> {
    if (sender.id !== extensionId || !sender.url?.startsWith(extensionOrigin)) {
      return Promise.resolve({ ok: false, error: "not allowed" });
    }
    const req = ShelfRequestSchema.safeParse(message);
    if (!req.success) return Promise.resolve({ ok: false, error: "invalid request" });
    const r = req.data;
    const run = () =>
      apply((s) => {
        switch (r.type) {
          case "anchor:shelf-add":
            return addButton(s, r.fingerprint);
          case "anchor:shelf-rename":
            return renameButton(s, r.id, r.name);
          case "anchor:shelf-remove":
            return removeButton(s, r.id);
          case "anchor:shelf-route-add":
            return addRoute(s, r.route);
          case "anchor:shelf-route-remove":
            return removeRoute(s, r.id);
          case "anchor:shelf-adapt-set":
            return setAdapt(s, r.settings);
        }
      });
    const result = queue.then(run, run);
    queue = result;
    return result;
  };
}
