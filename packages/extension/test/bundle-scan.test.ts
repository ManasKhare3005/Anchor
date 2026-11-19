import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scanBundle } from "./scan-bundle.ts";

const BUILD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.output/chrome-mv3");

describe("bundle scan self-test", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-scan-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ["fetch('/x')", "Hard Rule 6: fetch"],
    ["new XMLHttpRequest()", "Hard Rule 6: XMLHttpRequest"],
    ["new WebSocket(u)", "Hard Rule 6: WebSocket"],
    ["navigator.sendBeacon(u)", "Hard Rule 6: sendBeacon"],
    ["e.click()", "Hard Rule 1: .click()"],
    ["f.submit()", "Hard Rule 1: .submit()"],
    ["new MouseEvent('click')", "Hard Rule 1: synthetic input event"],
    ["window.open(u)", "Hard Rule 1: window.open"],
    ["location.assign(u)", "Hard Rule 1: location.assign/replace"],
  ])("catches %s", (code, rule) => {
    const file = join(dir, "planted.js");
    writeFileSync(file, `(()=>{${code}})();`);
    expect(scanBundle(dir).map((v) => v.rule)).toContain(rule);
  });

  it("allows WXT-style CustomEvent dispatch and ordinary code", () => {
    writeFileSync(
      join(dir, "planted.js"),
      "document.dispatchEvent(new CustomEvent('wxt:x'));el.scrollIntoView();s.replace(a,b);",
    );
    expect(scanBundle(dir)).toEqual([]);
  });
});

describe("built extension", () => {
  it("exists (run `wxt build` first; `npm test` does this)", () => {
    expect(existsSync(join(BUILD_DIR, "manifest.json"))).toBe(true);
  });

  it("contains no Hard Rule 1 or 6 violations", () => {
    expect(scanBundle(BUILD_DIR)).toEqual([]);
  });
});
