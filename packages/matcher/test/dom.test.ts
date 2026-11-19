import { describe, expect, it } from "vitest";
import {
  accessibleNameOf,
  ancestorTrailOf,
  attributesOf,
  collectCandidates,
  isHidden,
  looksGenerated,
  neighborTextOf,
  pathPattern,
  roleOf,
  signalsOf,
  textOf,
} from "../src/dom.ts";
import { dom, one } from "./helpers.ts";

describe("collectCandidates", () => {
  it("finds links, buttons, form controls and ARIA widgets in document order", () => {
    const doc = dom(`
      <a href="/a">A</a><button>B</button><input type="text"><select></select><textarea></textarea>
      <div role="button">C</div><span tabindex="0">D</span><div onclick="x()">E</div>
      <a>no href</a><input type="hidden"><span tabindex="-1">F</span><p>text</p>`);
    const got = collectCandidates(doc).map((e) => e.tagName.toLowerCase());
    expect(got).toEqual(["a", "button", "input", "select", "textarea", "div", "span", "div"]);
  });

  it("skips Anchor's own UI host", () => {
    const doc = dom(`<button>Site</button><div data-anchor><button>Anchor UI</button></div>`);
    expect(collectCandidates(doc).map((e) => textOf(e))).toEqual(["Site"]);
  });

  it("descends into open shadow roots", () => {
    const doc = dom(`<my-widget></my-widget>`);
    const host = one(doc, "my-widget");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button>Inside shadow</button>`;
    expect(collectCandidates(doc).map((e) => textOf(e))).toEqual(["Inside shadow"]);
  });

  it("descends into same-origin iframes", () => {
    const doc = dom(`<button>Outer</button><iframe></iframe>`);
    const frame = one(doc, "iframe") as HTMLIFrameElement;
    const inner = frame.contentDocument;
    if (!inner) throw new Error("jsdom gave no iframe document");
    inner.body.innerHTML = `<a href="/inner">Inner link</a>`;
    expect(collectCandidates(doc).map((e) => textOf(e))).toEqual(["Outer", "Inner link"]);
  });
});

describe("isHidden", () => {
  it.each([
    [`<button hidden id="t">x</button>`, true],
    [`<div style="display: none"><button id="t">x</button></div>`, true],
    [`<div aria-hidden="true"><button id="t">x</button></div>`, true],
    [`<details><summary>Menu</summary><a id="t" href="/x">x</a></details>`, true],
    [`<details open><summary>Menu</summary><a id="t" href="/x">x</a></details>`, false],
    [`<details><summary id="t">Menu</summary></details>`, false],
    [`<button id="t">x</button>`, false],
  ])("%s → %s", (html, expected) => {
    const doc = dom(html);
    expect(isHidden(one(doc, "#t"))).toBe(expected);
  });
});

describe("accessibleNameOf", () => {
  it("prefers aria-labelledby, then aria-label, then label, then contents", () => {
    const doc = dom(`
      <span id="l1">Labelled</span>
      <button id="a" aria-labelledby="l1" aria-label="aria">text</button>
      <button id="b" aria-label="Aria name">text</button>
      <label for="c">Your email</label><input id="c" type="email" placeholder="ph">
      <a id="d" href="/x"><img alt="Cart"> </a>
      <button id="e" title="Tooltip"></button>
      <input id="f" placeholder="Search products">`);
    expect(accessibleNameOf(one(doc, "#a"))).toBe("Labelled");
    expect(accessibleNameOf(one(doc, "#b"))).toBe("Aria name");
    expect(accessibleNameOf(one(doc, "#c"))).toBe("Your email");
    expect(accessibleNameOf(one(doc, "#d"))).toBe("Cart");
    expect(accessibleNameOf(one(doc, "#e"))).toBe("Tooltip");
    expect(accessibleNameOf(one(doc, "#f"))).toBe("Search products");
  });

  it("never uses the value attribute, even on submit buttons (cautious Hard Rule 7)", () => {
    const doc = dom(`<input id="s" type="submit" value="Pay now">`);
    expect(accessibleNameOf(one(doc, "#s"))).toBe("Submit");
  });
});

describe("roleOf", () => {
  it.each([
    [`<a id="t" href="/x">x</a>`, "link"],
    [`<button id="t">x</button>`, "button"],
    [`<summary id="t">x</summary>`, "button"],
    [`<input id="t" type="submit">`, "button"],
    [`<input id="t" type="checkbox">`, "checkbox"],
    [`<input id="t" type="search">`, "searchbox"],
    [`<input id="t">`, "textbox"],
    [`<select id="t"></select>`, "combobox"],
    [`<div id="t" role="menuitem link">x</div>`, "menuitem"],
  ])("%s → %s", (html, role) => {
    expect(roleOf(one(dom(html), "#t"))).toBe(role);
  });
});

describe("looksGenerated", () => {
  it.each(["ember1234", ":r1:", "css-1x2y3z", "Button_x7k2a", "a1b2c3d4e5f6", "react-select-12"])(
    "flags %s",
    (t) => expect(looksGenerated(t)).toBe(true),
  );
  it.each(["track-order", "nav-orders", "search-btn", "btn", "primary", "h2"])("keeps %s", (t) =>
    expect(looksGenerated(t)).toBe(false),
  );
});

describe("pathPattern", () => {
  it("drops origin, query, hash and replaces ids", () => {
    expect(pathPattern("https://x.com/Orders/1234/Track?ref=nav#top", "https://x.com/")).toBe(
      "/orders/*/track",
    );
    expect(pathPattern("/gp/css/order-history", "https://x.com/")).toBe("/gp/css/order-history");
    expect(pathPattern("javascript:void(0)", "https://x.com/")).toBe("javascript:");
  });
});

describe("attributesOf", () => {
  it("keeps stable attributes, drops generated ones and Anchor markers", () => {
    const doc = dom(
      `<a id="t" href="/orders/99812?x=1" class="nav-link css-1x2y3z" data-testid="orders"
          data-anchor-x="1" data-track="a1b2c3d4e5" aria-haspopup="true" name="ord">x</a>`,
    );
    expect(attributesOf(one(doc, "#t"))).toEqual({
      id: "t",
      href: "/orders/*",
      class: "nav-link",
      "data-testid": "orders",
      "aria-haspopup": "true",
      name: "ord",
    });
  });

  it("records the host of off-site links", () => {
    const doc = dom(`<a id="t" href="https://help.other.com/faq">Help</a>`);
    expect(attributesOf(one(doc, "#t"))["href-host"]).toBe("help.other.com");
  });
});

describe("neighborTextOf / ancestorTrailOf", () => {
  const doc = dom(`
    <header aria-label="Site header">
      <nav><a href="/">Home</a> <a id="t" href="/orders">Orders</a> <a href="/help">Help</a></nav>
    </header>
    <main><h2>Quick links</h2><p>Hello, Margaret. Balance $12.00</p><button id="b">Pay bill</button></main>
    <details><summary>Your account</summary><a id="m" href="/x">Settings</a></details>`);

  it("finds the nearest text before and after", () => {
    expect(neighborTextOf(one(doc, "#t"))).toEqual({ before: "Home", after: "Help" });
  });

  it("scrubs neighbor text", () => {
    expect(neighborTextOf(one(doc, "#b")).before).toBe("Hello <name>. Balance <money>");
  });

  it("builds a trail of landmarks, menus and the nearest heading", () => {
    expect(ancestorTrailOf(one(doc, "#t"))).toEqual(["header:site header", "nav"]);
    expect(ancestorTrailOf(one(doc, "#b"))).toEqual(["main", "heading:quick links"]);
    expect(ancestorTrailOf(one(doc, "#m"))).toEqual(["menu:your account"]);
  });
});

describe("Hard Rule 7: never records what the person types", () => {
  it("typed values never appear anywhere in the signals", () => {
    const doc = dom(`
      <form>
        <label for="n">Name</label><input id="n" type="text">
        <textarea id="ta"></textarea>
        <div id="ce" contenteditable="true"></div>
        <button id="go">Continue</button>
      </form>`);
    (one(doc, "#n") as HTMLInputElement).value = "SECRET-TYPED-NAME";
    (one(doc, "#ta") as HTMLTextAreaElement).value = "SECRET-TYPED-NOTE";
    one(doc, "#ce").textContent = "SECRET-TYPED-RICH";
    const everything = collectCandidates(doc).map((el) => JSON.stringify(signalsOf(el)));
    everything.push(JSON.stringify(signalsOf(one(doc, "#ce"))));
    for (const s of everything) {
      expect(s).not.toMatch(/SECRET/);
    }
  });

  it("never reads a text input's value attribute either (could be prefilled personal data)", () => {
    const doc = dom(`<input id="e" type="email" value="margaret@example.org"><button>Go</button>`);
    expect(JSON.stringify(signalsOf(one(doc, "#e")))).not.toMatch(/margaret/);
    expect(JSON.stringify(signalsOf(one(doc, "button")))).not.toMatch(/margaret/);
  });
});
