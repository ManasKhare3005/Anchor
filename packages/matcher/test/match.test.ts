import { describe, expect, it } from "vitest";
import { match, type ElementFingerprint } from "../src/index.ts";

const fp: ElementFingerprint = {
  id: "fp-1",
  site: "http://localhost",
  pageKind: "home",
  label: "Track order",
  text: "Track order",
  role: "button",
  attributes: {},
  domPath: "html>body>header>button",
  neighbors: [],
  position: { x: 0, y: 0, w: 100, h: 40 },
  lastSeen: "2026-11-14T00:00:00.000Z",
};

describe("match (stub)", () => {
  it("returns a well-formed result", () => {
    const result = match(fp, []);
    expect(result.fingerprintId).toBe("fp-1");
    expect(result.candidates).toEqual([]);
  });

  it("defaults to low confidence so callers fall back to Ask, never guess", () => {
    expect(
      match(fp, [
        {
          ref: "c1",
          text: "Track order",
          role: "button",
          attributes: {},
          domPath: "",
          neighbors: [],
        },
      ]).confidence,
    ).toBe("low");
  });
});
