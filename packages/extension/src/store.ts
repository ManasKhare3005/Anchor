import { FingerprintSchema, type Fingerprint } from "@anchor/matcher";
import { z } from "zod";
import { AdaptSettingsSchema, type AdaptSettings } from "./adapt.ts";
import { RouteSchema, type Route } from "./route.ts";

/**
 * The My buttons shelf, as stored in chrome.storage.local (CLAUDE.md § Technical decisions).
 *
 * Pure functions only. The service worker is the single writer (src/writer.ts); everything else
 * reads. Shelf order is array order, so a site's buttons always appear in the order they were
 * remembered.
 */

export const STORE_KEY = "anchor";
export const STORE_VERSION = 3;

export const StoreSchema = z.object({
  schemaVersion: z.literal(STORE_VERSION),
  buttons: z.array(FingerprintSchema),
  routes: z.array(RouteSchema),
  /** The person's setup answers (M4). null: setup not answered yet. */
  adapt: AdaptSettingsSchema.nullable(),
});

/** Version 2 (M3): buttons and routes. Migrated on read; the next write stores version 3. */
const StoreV2Schema = z.object({
  schemaVersion: z.literal(2),
  buttons: z.array(FingerprintSchema),
  routes: z.array(RouteSchema),
});

/** Version 1 (M2): buttons only. Migrated on read; the next write stores version 3. */
const StoreV1Schema = z.object({
  schemaVersion: z.literal(1),
  buttons: z.array(FingerprintSchema),
});

export type Store = z.infer<typeof StoreSchema>;

export const MAX_NAME_LENGTH = 60;

export function emptyStore(): Store {
  return { schemaVersion: STORE_VERSION, buttons: [], routes: [], adapt: null };
}

export type Parsed = { ok: true; store: Store } | { ok: false; error: string };

/**
 * Nothing stored yet is an empty shelf. Anything stored that doesn't validate is reported, never
 * silently replaced: the writer refuses to write over data it can't read.
 */
export function parseStore(raw: unknown): Parsed {
  if (raw === undefined) return { ok: true, store: emptyStore() };
  const r = StoreSchema.safeParse(raw);
  if (r.success) return { ok: true, store: r.data };
  const v2 = StoreV2Schema.safeParse(raw);
  if (v2.success) return { ok: true, store: { ...emptyStore(), ...v2.data, schemaVersion: 3 } };
  const v1 = StoreV1Schema.safeParse(raw);
  if (v1.success) return { ok: true, store: { ...emptyStore(), buttons: v1.data.buttons } };
  return { ok: false, error: "stored data is invalid" };
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

// ---- Routes ----

export function routesFor(store: Store, site: string): Route[] {
  return store.routes.filter((r) => r.site === site);
}

export function addRoute(store: Store, route: Route): Store {
  const parsed = RouteSchema.parse({ ...route, name: cleanName(route.name) });
  if (store.routes.some((r) => r.id === parsed.id)) {
    throw new StoreError("a task with this id is already saved");
  }
  return { ...store, routes: [...store.routes, parsed] };
}

export function removeRoute(store: Store, id: string): Store {
  if (!store.routes.some((r) => r.id === id)) throw new StoreError("no such task");
  return { ...store, routes: store.routes.filter((r) => r.id !== id) };
}

// ---- Adapt ----

export function setAdapt(store: Store, settings: AdaptSettings): Store {
  return { ...store, adapt: AdaptSettingsSchema.parse(settings) };
}
