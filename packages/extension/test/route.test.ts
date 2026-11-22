import type { Fingerprint } from "@anchor/matcher";
import { describe, expect, it } from "vitest";
import {
  RouteSchema,
  clickStep,
  labelOf,
  routeHelpNote,
  withoutNeighborText,
  yourTurnStep,
  type Route,
} from "../src/route.ts";
import { STORE_KEY, addRoute, emptyStore, removeRoute, routesFor } from "../src/store.ts";
import { createWriter, type StorageArea } from "../src/writer.ts";

function fp(text: string, role = "button", site = "riverbank.test"): Fingerprint {
  return {
    schemaVersion: 1,
    id: `fp-${text}`,
    site,
    pagePattern: "/billpay",
    signals: {
      text: role === "textbox" ? "" : text,
      accessibleName: text,
      role,
      tag: role === "textbox" ? "input" : "button",
      attributes: {},
      neighborText: { before: "", after: "" },
      ancestorTrail: [],
    },
    variants: [],
    createdAt: "2026-11-22T00:00:00.000Z",
    lastSeenAt: "2026-11-22T00:00:00.000Z",
  };
}

function route(id: string, site = "riverbank.test"): Route {
  return {
    id,
    name: "Pay the light bill",
    site,
    steps: [clickStep(fp("Bill Pay")), yourTurnStep(fp("Amount", "textbox"), "type")],
  };
}

describe("steps and instructions", () => {
  it("uses the site's own label in plain words", () => {
    expect(clickStep(fp("Pay now")).instruction).toBe('Click "Pay now".');
    expect(yourTurnStep(fp("Amount", "textbox"), "type").instruction).toBe(
      'Your turn: fill in "Amount".',
    );
    expect(yourTurnStep(fp("Payee", "combobox"), "choose").instruction).toBe(
      'Your turn: choose "Payee".',
    );
  });

  it("falls back to calm words when there is no label", () => {
    expect(clickStep(fp("")).instruction).toBe("Click the circled button.");
    expect(yourTurnStep(fp("", "textbox"), "type").instruction).toBe(
      "Your turn: fill in the circled box.",
    );
  });

  it("caps long labels", () => {
    expect(labelOf(fp("x".repeat(100)))).toHaveLength(58);
  });

  it("click and your-turn steps need a fingerprint", () => {
    const bad = { ...route("r"), steps: [{ kind: "click", instruction: "Click." }] };
    expect(RouteSchema.safeParse(bad).success).toBe(false);
    const nav = { ...route("r"), steps: [{ kind: "navigate", instruction: "Go to Bill Pay." }] };
    expect(RouteSchema.safeParse(nav).success).toBe(true);
  });
});

describe("after the person typed", () => {
  it("steps keep no neighbor text, which could repeat what was typed", () => {
    const f = fp("Pay now");
    f.signals.neighborText = { before: "Memo Zebrafinch", after: "Change details" };
    const safe = withoutNeighborText(f);
    expect(safe.signals.neighborText).toEqual({ before: "", after: "" });
    expect(JSON.stringify(safe)).not.toContain("Zebrafinch");
    expect(f.signals.neighborText.before).toBe("Memo Zebrafinch");
  });
});

describe("route help note", () => {
  it("names site, route, step number and label; nothing else", () => {
    const r = route("r");
    const step = yourTurnStep(fp("Amount", "textbox"), "type");
    const note = routeHelpNote("riverbank.test", r.name, 1, step, new Date("2026-11-22T10:00:00Z"));
    expect(note).toBe(
      'Anchor couldn\'t find step 2 ("Amount") of "Pay the light bill" on riverbank.test (2026-11-22). Could you take a look?',
    );
  });
});

describe("route reducers", () => {
  it("adds, filters by site and removes", () => {
    let s = addRoute(emptyStore(), route("a"));
    s = addRoute(s, route("b", "other.test"));
    expect(routesFor(s, "riverbank.test").map((r) => r.id)).toEqual(["a"]);
    expect(() => addRoute(s, route("a"))).toThrow(/already/);
    s = removeRoute(s, "a");
    expect(s.routes.map((r) => r.id)).toEqual(["b"]);
    expect(() => removeRoute(s, "a")).toThrow(/no such/);
  });

  it("cleans the task name", () => {
    const s = addRoute(emptyStore(), { ...route("a"), name: "  Pay the\n bill " });
    expect(s.routes[0]?.name).toBe("Pay the bill");
  });

  it("rejects an empty route", () => {
    expect(() => addRoute(emptyStore(), { ...route("a"), steps: [] })).toThrow();
  });
});

describe("writer accepts routes from the panel only", () => {
  const ORIGIN = "chrome-extension://ext/";
  const area = (): StorageArea & { data: Record<string, unknown> } => {
    const data: Record<string, unknown> = {};
    return {
      data,
      get: (k) => Promise.resolve(k in data ? { [k]: structuredClone(data[k]) } : {}),
      set: (items) => {
        Object.assign(data, structuredClone(items));
        return Promise.resolve();
      },
    };
  };

  it("adds and removes a route", async () => {
    const a = area();
    const write = createWriter(a, "ext", ORIGIN);
    const panel = { id: "ext", url: `${ORIGIN}sidepanel.html` };
    expect((await write({ type: "anchor:shelf-route-add", route: route("a") }, panel)).ok).toBe(
      true,
    );
    expect((a.data[STORE_KEY] as { routes: unknown[] }).routes).toHaveLength(1);
    expect((await write({ type: "anchor:shelf-route-remove", id: "a" }, panel)).ok).toBe(true);
    expect((a.data[STORE_KEY] as { routes: unknown[] }).routes).toHaveLength(0);
  });

  it("refuses a content script", async () => {
    const a = area();
    const write = createWriter(a, "ext", ORIGIN);
    const r = await write(
      { type: "anchor:shelf-route-add", route: route("a") },
      { id: "ext", url: "http://localhost/" },
    );
    expect(r.ok).toBe(false);
    expect(a.data[STORE_KEY]).toBeUndefined();
  });
});
