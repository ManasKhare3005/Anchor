import { FingerprintSchema, type Fingerprint } from "@anchor/matcher";
import { z } from "zod";

/**
 * The My buttons shelf, as stored in chrome.storage.local (CLAUDE.md § Technical decisions).
 *
 * Pure functions only. The service worker is the single writer (src/writer.ts); everything else
 * reads. Shelf order is array order, so a site's buttons always appear in the order they were
 * remembered.
 */

export const STORE_KEY = "anchor";
export const STORE_VERSION = 1;

export const StoreSchema = z.object({
  schemaVersion: z.literal(STORE_VERSION),
  buttons: z.array(FingerprintSchema),
});

export type Store = z.infer<typeof StoreSchema>;

export const MAX_NAME_LENGTH = 60;

export function emptyStore(): Store {
  return { schemaVersion: STORE_VERSION, buttons: [] };
}

export type Parsed = { ok: true; store: Store } | { ok: false; error: string };

/**
 * Nothing stored yet is an empty shelf. Anything stored that doesn't validate is reported, never
 * silently replaced: the writer refuses to write over data it can't read.
 */
export function parseStore(raw: unknown): Parsed {
  if (raw === undefined) return { ok: true, store: emptyStore() };
  const r = StoreSchema.safeParse(raw);
  return r.success ? { ok: true, store: r.data } : { ok: false, error: "stored data is invalid" };
}

/** A personal name: single line, trimmed, length-capped. Empty means "no name". */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

export function buttonsFor(store: Store, site: string): Fingerprint[] {
  return store.buttons.filter((b) => b.site === site);
}

/** The name shown on the shelf: the person's own name, else the site's label. */
export function displayName(fp: Fingerprint): string {
  return fp.personalName || fp.signals.text || fp.signals.accessibleName || "Button";
}

export class StoreError extends Error {}

export function addButton(store: Store, fp: Fingerprint): Store {
  const parsed = FingerprintSchema.parse(fp);
  if (store.buttons.some((b) => b.id === parsed.id)) {
    throw new StoreError("a button with this id is already on the shelf");
  }
  const name = cleanName(parsed.personalName ?? "");
  const { personalName: _drop, ...rest } = parsed;
  void _drop;
  const button: Fingerprint = name ? { ...rest, personalName: name } : rest;
  return { ...store, buttons: [...store.buttons, button] };
}

export function renameButton(store: Store, id: string, name: string): Store {
  if (!store.buttons.some((b) => b.id === id)) throw new StoreError("no such button");
  const clean = cleanName(name);
  return {
    ...store,
    buttons: store.buttons.map((b) => {
      if (b.id !== id) return b;
      const { personalName: _drop, ...rest } = b;
      void _drop;
      return clean ? { ...rest, personalName: clean } : rest;
    }),
  };
}

export function removeButton(store: Store, id: string): Store {
  if (!store.buttons.some((b) => b.id === id)) throw new StoreError("no such button");
  return { ...store, buttons: store.buttons.filter((b) => b.id !== id) };
}
