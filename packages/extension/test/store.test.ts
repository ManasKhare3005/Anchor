import type { Fingerprint } from "@anchor/matcher";
import { describe, expect, it } from "vitest";
import {
  MAX_NAME_LENGTH,
  STORE_KEY,
  addButton,
  buttonsFor,
  cleanName,
  displayName,
  emptyStore,
  parseStore,
  removeButton,
  renameButton,
} from "../src/store.ts";
import { createWriter, type StorageArea } from "../src/writer.ts";

function fp(id: string, site = "riverbank.test", text = "Pay a bill"): Fingerprint {
  return {
    schemaVersion: 1,
    id,
    site,
    pagePattern: "/home",
    signals: {
      text,
      accessibleName: text,
      role: "button",
      tag: "button",
      attributes: {},
      neighborText: { before: "", after: "" },
      ancestorTrail: [],
    },
    variants: [],
    createdAt: "2026-11-21T00:00:00.000Z",
    lastSeenAt: "2026-11-21T00:00:00.000Z",
  };
}

describe("store reducers", () => {
  it("keeps insertion order and filters by site", () => {
    let s = emptyStore();
    s = addButton(s, fp("a"));
    s = addButton(s, fp("b", "other.test"));
    s = addButton(s, fp("c"));
    expect(buttonsFor(s, "riverbank.test").map((b) => b.id)).toEqual(["a", "c"]);
    expect(buttonsFor(s, "other.test").map((b) => b.id)).toEqual(["b"]);
  });

  it("rejects duplicate ids and invalid fingerprints", () => {
    const s = addButton(emptyStore(), fp("a"));
    expect(() => addButton(s, fp("a"))).toThrow(/already/);
    expect(() => addButton(s, { ...fp("x"), site: "" })).toThrow();
  });

  it("cleans personal names and drops empty ones", () => {
    let s = addButton(emptyStore(), { ...fp("a"), personalName: "  Pay the\nlight bill  " });
    expect(s.buttons[0]?.personalName).toBe("Pay the light bill");
    s = renameButton(s, "a", "   ");
    expect(s.buttons[0]).not.toHaveProperty("personalName");
    expect(cleanName("x".repeat(200))).toHaveLength(MAX_NAME_LENGTH);
  });

  it("renames and removes only the named button", () => {
    let s = addButton(addButton(emptyStore(), fp("a")), fp("b"));
    s = renameButton(s, "b", "Bills");
    expect(s.buttons.map(displayName)).toEqual(["Pay a bill", "Bills"]);
    s = removeButton(s, "a");
    expect(s.buttons.map((b) => b.id)).toEqual(["b"]);
    expect(() => removeButton(s, "a")).toThrow(/no such/);
  });

  it("does not mutate the input store", () => {
    const s = addButton(emptyStore(), fp("a"));
    const before = JSON.stringify(s);
    removeButton(renameButton(s, "a", "New"), "a");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("parses missing data as empty and reports invalid data", () => {
    expect(parseStore(undefined)).toEqual({ ok: true, store: emptyStore() });
    expect(parseStore({ schemaVersion: 2, buttons: [] }).ok).toBe(false);
    expect(parseStore({ schemaVersion: 3, buttons: [], routes: [] }).ok).toBe(false);
    expect(parseStore({ schemaVersion: 1, buttons: [{ id: 1 }] }).ok).toBe(false);
  });
});

describe("schema migration", () => {
  it("reads version 1 (buttons only) as version 2 with no routes", () => {
    const v1 = { schemaVersion: 1, buttons: [fp("a")] };
    const r = parseStore(v1);
    expect(r.ok && r.store).toEqual({ schemaVersion: 2, buttons: [fp("a")], routes: [] });
  });

  it("the next write stores version 2 and keeps the buttons", async () => {
    const area = fakeArea({ schemaVersion: 1, buttons: [fp("a")] });
    const write = createWriter(area, "ext", ORIGIN);
    expect((await write({ type: "anchor:shelf-add", fingerprint: fp("b") }, PANEL)).ok).toBe(true);
    const stored = area.data[STORE_KEY] as { schemaVersion: number; buttons: { id: string }[] };
    expect(stored.schemaVersion).toBe(2);
    expect(stored.buttons.map((b) => b.id)).toEqual(["a", "b"]);
  });
});

function fakeArea(initial?: unknown): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = initial === undefined ? {} : { [STORE_KEY]: initial };
  return {
    data,
    get: (key) => Promise.resolve(key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items) => {
      // A slow write, so overlapping requests would race without the queue.
      await new Promise((r) => setTimeout(r, 5));
      Object.assign(data, structuredClone(items));
    },
  };
}

const ORIGIN = "chrome-extension://ext/";
const PANEL = { id: "ext", url: `${ORIGIN}sidepanel.html` };

describe("writer (single writer in the service worker)", () => {
  it("applies concurrent requests one at a time", async () => {
    const area = fakeArea();
    const write = createWriter(area, "ext", ORIGIN);
    const replies = await Promise.all(
      ["a", "b", "c", "d"].map((id) =>
        write({ type: "anchor:shelf-add", fingerprint: fp(id) }, PANEL),
      ),
    );
    expect(replies.every((r) => r.ok)).toBe(true);
    const stored = parseStore(area.data[STORE_KEY]);
    expect(stored.ok && stored.store.buttons.map((b) => b.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("refuses senders that are not extension pages", async () => {
    const area = fakeArea();
    const write = createWriter(area, "ext", ORIGIN);
    const add = { type: "anchor:shelf-add", fingerprint: fp("a") };
    expect(await write(add, { id: "other", url: `${ORIGIN}x` })).toEqual({
      ok: false,
      error: "not allowed",
    });
    // A content script has the same id but reports the web page's URL.
    expect(await write(add, { id: "ext", url: "https://bank.example/" })).toEqual({
      ok: false,
      error: "not allowed",
    });
    expect(area.data[STORE_KEY]).toBeUndefined();
  });

  it("refuses malformed requests", async () => {
    const write = createWriter(fakeArea(), "ext", ORIGIN);
    expect((await write({ type: "anchor:shelf-add", fingerprint: { id: "x" } }, PANEL)).ok).toBe(
      false,
    );
    expect((await write({ type: "anchor:shelf-nuke" }, PANEL)).ok).toBe(false);
  });

  it("never writes over stored data it cannot read", async () => {
    const corrupt = { schemaVersion: 99, buttons: "?" };
    const area = fakeArea(corrupt);
    const write = createWriter(area, "ext", ORIGIN);
    const r = await write({ type: "anchor:shelf-add", fingerprint: fp("a") }, PANEL);
    expect(r.ok).toBe(false);
    expect(area.data[STORE_KEY]).toEqual(corrupt);
  });

  it("a failed request does not block later ones", async () => {
    const area = fakeArea();
    const write = createWriter(area, "ext", ORIGIN);
    expect((await write({ type: "anchor:shelf-remove", id: "nope" }, PANEL)).ok).toBe(false);
    expect((await write({ type: "anchor:shelf-add", fingerprint: fp("a") }, PANEL)).ok).toBe(true);
  });
});
