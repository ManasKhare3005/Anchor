import "./style.css";
import type { Fingerprint } from "@anchor/matcher";
import {
  PickEventSchema,
  type ContentRequest,
  type FindReply,
  type ShelfReply,
  type ShelfRequest,
  type WhereReply,
} from "../../src/messages.ts";
import { readNameField } from "../../src/panel/name-field.ts";
import { WORDS, detailsFor, helpNote, messageFor } from "../../src/panel/words.ts";
import { STORE_KEY, buttonsFor, displayName, parseStore } from "../../src/store.ts";

/**
 * The My buttons shelf. Calm for the person (their buttons, one message at a time), details for
 * the helper (under "For helpers").
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>("status");
const note = $<HTMLDivElement>("note");
const noteText = $<HTMLParagraphElement>("note-text");
const shelf = $<HTMLUListElement>("shelf");
const manage = $<HTMLUListElement>("manage");
const details = $<HTMLParagraphElement>("details");
const nameForm = $<HTMLFormElement>("name-form");
const nameInput = $<HTMLInputElement>("name");
const rememberButton = $<HTMLButtonElement>("remember");

/** Which tab the shelf is for. `?tab=<id>` pins one (e2e opens the panel as a normal page). */
const pinned = Number(new URLSearchParams(location.search).get("tab"));
let tabId: number | null = null;
let where: WhereReply | null = null;
let buttons: Fingerprint[] = [];
let pending: Fingerprint | null = null;

function say(message: string): void {
  status.textContent = message;
}

function showNote(text: string | null): void {
  note.hidden = text === null;
  noteText.textContent = text ?? "";
}

async function targetTab(): Promise<number | null> {
  if (Number.isInteger(pinned) && pinned > 0) return pinned;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function toPage<T>(message: ContentRequest): Promise<T | null> {
  if (tabId === null) return null;
  try {
    return ((await browser.tabs.sendMessage(tabId, message)) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

async function toStore(message: ShelfRequest): Promise<ShelfReply> {
  try {
    return (await browser.runtime.sendMessage(message)) as ShelfReply;
  } catch {
    return { ok: false, error: "no reply" };
  }
}

function button(label: string, onPress: () => void, className = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener("click", onPress);
  return b;
}

function renderShelf(): void {
  shelf.replaceChildren(
    ...buttons.map((fp) => {
      const li = document.createElement("li");
      li.append(button(displayName(fp), () => void find(fp), "shelf-button"));
      return li;
    }),
  );
  manage.replaceChildren(
    ...buttons.map((fp) => {
      const li = document.createElement("li");
      li.className = "manage-item";
      const name = document.createElement("span");
      name.textContent = displayName(fp);
      li.append(
        name,
        button("Remove", () => void remove(fp), "remove"),
      );
      li.lastElementChild?.setAttribute("aria-label", `Remove ${displayName(fp)}`);
      return li;
    }),
  );
}

async function loadButtons(): Promise<void> {
  const parsed = parseStore((await browser.storage.local.get(STORE_KEY))[STORE_KEY]);
  buttons = parsed.ok && where ? buttonsFor(parsed.store, where.site) : [];
  renderShelf();
}

/** Re-read which page the tab shows and its buttons. */
async function refresh(): Promise<void> {
  tabId = await targetTab();
  where = await toPage<WhereReply>({ type: "anchor:where" });
  rememberButton.disabled = where === null;
  await loadButtons();
  showNote(null);
  if (!where) say(WORDS.unsupported);
  else say(buttons.length ? WORDS.ready : WORDS.empty);
}

async function find(fp: Fingerprint): Promise<void> {
  showNote(null);
  say(WORDS.looking);
  const reply = await toPage<FindReply>({
    type: "anchor:find",
    fingerprint: fp,
    siteButtons: buttons,
  });
  if (!reply) {
    say(WORDS.pageGone);
    return;
  }
  say(messageFor(reply));
  details.textContent = detailsFor(displayName(fp), reply);
  if (reply.tier === "unsure" && reply.state !== "logged-out" && where) {
    showNote(helpNote(where.site, displayName(fp), new Date()));
  }
}

async function remove(fp: Fingerprint): Promise<void> {
  const r = await toStore({ type: "anchor:shelf-remove", id: fp.id });
  say(r.ok ? WORDS.removed : WORDS.problem);
}

rememberButton.addEventListener("click", () => {
  void (async () => {
    showNote(null);
    nameForm.hidden = true;
    const ok = await toPage<{ ok: boolean }>({ type: "anchor:pick-start" });
    say(ok ? WORDS.pickNow : WORDS.unsupported);
  })();
});

nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fp = pending;
  if (!fp) return;
  void (async () => {
    const name = readNameField(nameInput).trim();
    const r = await toStore({
      type: "anchor:shelf-add",
      fingerprint: name ? { ...fp, personalName: name } : fp,
    });
    if (r.ok) {
      pending = null;
      nameForm.hidden = true;
    }
    say(r.ok ? WORDS.saved : WORDS.problem);
  })();
});

$<HTMLButtonElement>("cancel-name").addEventListener("click", () => {
  pending = null;
  nameForm.hidden = true;
  say(WORDS.pickCancelled);
});

$<HTMLButtonElement>("show-original").addEventListener("click", () => {
  void (async () => {
    showNote(null);
    await toPage({ type: "anchor:show-original" });
    say(WORDS.original);
  })();
});

$<HTMLButtonElement>("copy-note").addEventListener("click", () => {
  void navigator.clipboard.writeText(noteText.textContent ?? "").then(
    () => say(WORDS.copied),
    () => say(WORDS.copyFailed),
  );
});

// Picks come from the content script of the tab this shelf is for.
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.tab?.id === undefined || sender.tab.id !== tabId) return undefined;
  const event = PickEventSchema.safeParse(message);
  if (!event.success) return undefined;
  if (event.data.type === "anchor:pick-cancelled") {
    say(WORDS.pickCancelled);
    return undefined;
  }
  pending = event.data.fingerprint;
  nameInput.defaultValue = displayName(pending);
  nameForm.reset();
  nameForm.hidden = false;
  $<HTMLDetailsElement>("helper").open = true;
  nameInput.focus();
  nameInput.select();
  say("What should this button be called?");
  return undefined;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORE_KEY in changes) void loadButtons();
});

browser.tabs.onActivated.addListener(() => {
  if (!pinned) void refresh();
});

browser.tabs.onUpdated.addListener((id, info) => {
  if (id === tabId && info.status === "complete") void refresh();
});

void refresh();
