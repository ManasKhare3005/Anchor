import { ShelfRequestSchema, type ShelfReply } from "./messages.ts";
import {
  STORE_KEY,
  StoreError,
  addButton,
  parseStore,
  removeButton,
  renameButton,
  type Store,
} from "./store.ts";

/** The part of chrome.storage.local the writer needs (a fake in unit tests). */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Who sent a message. Only extension pages (no tab) may write; content scripts and pages may not. */
export interface Sender {
  id?: string;
  tab?: unknown;
}

/**
 * The single writer for the shelf. Requests are applied one at a time (each read-modify-write
 * finishes before the next starts), so two quick saves can't overwrite each other.
 */
export function createWriter(area: StorageArea, extensionId: string) {
  let queue: Promise<unknown> = Promise.resolve();

  async function apply(change: (s: Store) => Store): Promise<ShelfReply> {
    const parsed = parseStore((await area.get(STORE_KEY))[STORE_KEY]);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    let next: Store;
    try {
      next = change(parsed.store);
    } catch (e) {
      if (e instanceof StoreError) return { ok: false, error: e.message };
      return { ok: false, error: "invalid button" };
    }
    await area.set({ [STORE_KEY]: next });
    return { ok: true };
  }

  return function handle(message: unknown, sender: Sender): Promise<ShelfReply> {
    if (sender.id !== extensionId || sender.tab !== undefined) {
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
        }
      });
    const result = queue.then(run, run);
    queue = result;
    return result;
  };
}
