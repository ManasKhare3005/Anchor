import { describe, expect, it } from "vitest";
import { clip, normalize, scrub, tokens } from "../src/text.ts";

describe("scrub (privacy)", () => {
  it.each([
    ["Balance: $1,234.56", "Balance: <money>"],
    ["Total $5", "Total <money>"],
    ["Pay 49,90 € now", "Pay <money> now"],
    ["Amount due 120.00 USD", "Amount due <money>"],
    ["Order #112-4455667-1234", "Order #<num>"],
    ["Card ending 4242 4242 4242 4242", "Card ending <num>"],
    ["Call 555-123-4567", "Call <num>"],
    ["Contact margaret.smith@example.org", "Contact <email>"],
    ["Hello, Margaret", "Hello <name>"],
    ["Hi Sam! Your orders", "Hi <name>! Your orders"],
    ["Welcome back, José", "Welcome back <name>"],
    ["Good morning Priya", "Good morning <name>"],
  ])("%s → %s", (input, expected) => {
    expect(scrub(input)).toBe(expected);
  });

  it.each(["Track order", "Sign in", "Your account", "Pay bill", "Refill prescription", "Help"])(
    "leaves ordinary labels alone: %s",
    (label) => {
      expect(scrub(label)).toBe(label);
    },
  );

  it("keeps short numbers (step counts, sizes)", () => {
    expect(scrub("Step 2 of 3")).toBe("Step 2 of 3");
  });

  it("scrubs years too (dates can be personal); acceptable loss", () => {
    expect(scrub("Since 2019")).toBe("Since <num>");
  });
});

describe("normalize / tokens", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalize("  Café — Track-Order!  ")).toBe("cafe track order");
  });

  it("keeps scrub placeholders as tokens", () => {
    expect(tokens("Pay <money> now")).toEqual(["pay", "moneyplaceholder", "now"]);
  });
});

describe("clip", () => {
  it("cuts on a word boundary", () => {
    expect(clip("one two three four five", 12)).toBe("one two");
  });
  it("keeps the end when asked", () => {
    expect(clip("one two three four five", 12, true)).toBe("four five");
  });
});
