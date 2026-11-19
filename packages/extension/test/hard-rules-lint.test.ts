import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Proves the Hard Rule lint checks in eslint.config.js actually fire. If someone edits the config
 * and a rule stops matching, these tests fail.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const eslint = new ESLint({ cwd: ROOT });

async function messagesFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, filePath) });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax" || m.ruleId === "no-restricted-globals")
    .map((m) => m.message);
}

const SHIPPED_FILE = "packages/extension/entrypoints/__lint_probe__.ts";
const MATCHER_FILE = "packages/matcher/src/__lint_probe__.ts";

const BANNED: [rule: string, code: string][] = [
  ["Hard Rule 1", "declare const el: HTMLElement; el.click();"],
  ["Hard Rule 1", "declare const f: HTMLFormElement; f.submit();"],
  ["Hard Rule 1", "declare const f: HTMLFormElement; f.requestSubmit();"],
  ["Hard Rule 1", "new MouseEvent('click');"],
  ["Hard Rule 1", "new KeyboardEvent('keydown');"],
  ["Hard Rule 1", "new PointerEvent('pointerdown');"],
  ["Hard Rule 1", "declare const el: HTMLElement; el.dispatchEvent(new Event('x'));"],
  ["Hard Rule 1", "window.open('https://example.com');"],
  ["Hard Rule 1", "open('https://example.com');"],
  ["Hard Rule 1", "location.assign('/x');"],
  ["Hard Rule 1", "window.location.replace('/x');"],
  ["Hard Rule 1", "location.href = '/x';"],
  ["Hard Rule 1", "history.pushState({}, '', '/x');"],
  ["Hard Rule 1", "declare const b: { tabs: { update(o: object): void } }; b.tabs.update({});"],
  ["Hard Rule 6", "void fetch('/x');"],
  ["Hard Rule 6", "void globalThis.fetch('/x');"],
  ["Hard Rule 6", "new XMLHttpRequest();"],
  ["Hard Rule 6", "new WebSocket('ws://x');"],
  ["Hard Rule 6", "new EventSource('/x');"],
  ["Hard Rule 6", "navigator.sendBeacon('/x');"],
  ["Hard Rule 7", "declare const i: HTMLInputElement; console.log(i.value);"],
  ["Hard Rule 7", "declare const i: HTMLInputElement; console.log(i['value']);"],
  ["Hard Rule 7", "declare const i: HTMLInputElement; const { value } = i; console.log(value);"],
  ["Hard Rule 7", "declare const i: Element; i.getAttribute('value');"],
  ["Hard Rule 7", "declare const f: HTMLFormElement; new FormData(f);"],
];

describe("Hard Rule lint checks fire on shipped source", () => {
  it.each(BANNED)("%s: %s", async (rule, code) => {
    const messages = await messagesFor(code, SHIPPED_FILE);
    expect(messages.some((m) => m.includes(rule))).toBe(true);
  });

  it("allows ordinary code", async () => {
    const ok = "declare const el: HTMLElement; el.scrollIntoView(); el.getAttribute('aria-label');";
    expect(await messagesFor(ok, SHIPPED_FILE)).toEqual([]);
  });
});

describe("matcher purity", () => {
  it.each(["document.body;", "window.innerWidth;", "chrome.runtime.id;", "void fetch('/x');"])(
    "bans %s",
    async (code) => {
      expect((await messagesFor(code, MATCHER_FILE)).length).toBeGreaterThan(0);
    },
  );

  it("still applies Hard Rule 1 in the matcher", async () => {
    const messages = await messagesFor("declare const el: HTMLElement; el.click();", MATCHER_FILE);
    expect(messages.some((m) => m.includes("Hard Rule 1"))).toBe(true);
  });
});
