import { describe, expect, it } from "vitest";
import type { FindReply } from "../src/messages.ts";
import { WORDS, detailsFor, helpNote, messageFor } from "../src/panel/words.ts";

const reply = (over: Partial<FindReply>): FindReply => ({
  tier: "sure",
  inMenu: false,
  state: "normal",
  score: 0.8,
  gap: 0.4,
  reasons: [],
  ...over,
});

describe("panel words", () => {
  it("one calm message per outcome", () => {
    expect(messageFor(reply({}))).toBe(WORDS.sure);
    expect(messageFor(reply({ tier: "fairly" }))).toBe(WORDS.fairly);
    expect(messageFor(reply({ tier: "fairly", inMenu: true }))).toBe(WORDS.inMenu);
    expect(messageFor(reply({ tier: "unsure" }))).toBe(WORDS.changed);
    expect(messageFor(reply({ tier: "unsure", state: "logged-out" }))).toBe(WORDS.signedOut);
  });

  it("no jargon or error codes in what the person reads", () => {
    for (const text of Object.values(WORDS)) {
      expect(text).not.toMatch(/error|fail|invalid|null|undefined|tier|score|\d{3}/i);
    }
  });

  it("the help note names site, button and date only", () => {
    const note = helpNote("riverbank.test", "Pay a bill", new Date("2026-11-21T15:00:00Z"));
    expect(note).toBe(
      'Anchor couldn\'t find the "Pay a bill" button on riverbank.test (2026-11-21). Could you take a look?',
    );
  });

  it("helper details carry the technical numbers", () => {
    const d = detailsFor("Pay", reply({ tier: "unsure", score: 0.41, gap: 0.05, reasons: ["x."] }));
    expect(d).toBe('"Pay": unsure, score 41%, gap 5%, site looks normal. x.');
  });
});
