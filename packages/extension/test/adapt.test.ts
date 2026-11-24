import { describe, expect, it } from "vitest";
import { ADAPT_OFF, AdaptSettingsSchema, isIdle, planFor } from "../src/adapt.ts";

describe("setup answers → what Adapt does", () => {
  it("all No changes nothing", () => {
    expect(isIdle(planFor(ADAPT_OFF))).toBe(true);
  });

  it("hard-to-read text: bigger page, more spacing, stronger contrast", () => {
    expect(planFor({ ...ADAPT_OFF, text: "larger" })).toMatchObject({
      zoom: 1.25,
      spacing: true,
      contrast: true,
      targets: false,
      motion: false,
      declutter: false,
    });
    expect(planFor({ ...ADAPT_OFF, text: "largest" }).zoom).toBe(1.5);
  });

  it("small buttons: larger targets only", () => {
    const p = planFor({ ...ADAPT_OFF, targets: true });
    expect(p).toMatchObject({ zoom: 1, targets: true, spacing: false, motion: false });
  });

  it("busy pages: calmer motion and clutter hiding", () => {
    const p = planFor({ ...ADAPT_OFF, calm: true });
    expect(p).toMatchObject({ zoom: 1, motion: true, declutter: true, targets: false });
  });

  it("settings are validated", () => {
    expect(AdaptSettingsSchema.safeParse({ text: "huge", targets: true, calm: true }).success).toBe(
      false,
    );
    expect(AdaptSettingsSchema.safeParse({ text: "larger", targets: true }).success).toBe(false);
  });
});
