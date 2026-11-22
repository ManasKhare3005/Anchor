import "./style.css";
import type { Fingerprint } from "@anchor/matcher";
import {
  PageEventSchema,
  type ContentRequest,
  type FindReply,
  type ShelfReply,
  type ShelfRequest,
  type WhereReply,
} from "../../src/messages.ts";
import { readNameField } from "../../src/panel/name-field.ts";
import { WORDS, detailsFor, helpNote, messageFor } from "../../src/panel/words.ts";
import type { Route, Step } from "../../src/route.ts";
import { STORE_KEY, buttonsFor, displayName, parseStore, routesFor } from "../../src/store.ts";

/**
 * The My buttons shelf and My tasks. Calm for the person (their buttons and tasks, one message at
 * a time), details for the helper (under "For helpers").
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
const recordButton = $<HTMLButtonElement>("record");
const recorder = $<HTMLDivElement>("recorder");
const recordedList = $<HTMLOListElement>("recorded");
const taskForm = $<HTMLFormElement>("task-form");
const taskName = $<HTMLInputElement>("task-name");
const taskList = $<HTMLUListElement>("tasks");
const manageTasks = $<HTMLUListElement>("manage-tasks");

/** Which tab the shelf is for. `?tab=<id>` pins one (e2e opens the panel as a normal page). */
const pinned = Number(new URLSearchParams(location.search).get("tab"));
let tabId: number | null = null;
let where: WhereReply | null = null;
let buttons: Fingerprint[] = [];
let routes: Route[] = [];
let pending: Fingerprint | null = null;

/** A task being recorded: steps so far, all on one site. Lives here because pages reload. */
let recording: { site: string; steps: Step[] } | null = null;
/** A recorded task waiting for its name. */
let unnamed: { site: string; steps: Step[] } | null = null;

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

function manageItem(label: string, removeLabel: string, onRemove: () => void): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "manage-item";
  const name = document.createElement("span");
  name.textContent = label;
  const rm = button("Remove", onRemove, "remove");
  rm.setAttribute("aria-label", removeLabel);
  li.append(name, rm);
  return li;
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
    ...buttons.map((fp) =>
      manageItem(displayName(fp), `Remove ${displayName(fp)}`, () => void remove(fp)),
    ),
  );
  taskList.replaceChildren(
    ...routes.map((r) => {
      const li = document.createElement("li");
      li.append(button(r.name, () => void startGuide(r), "shelf-button task-button"));
      return li;
    }),
  );
  manageTasks.replaceChildren(
    ...routes.map((r) =>
      manageItem(`${r.name} (${r.steps.length} steps)`, `Remove ${r.name}`, () => {
        void removeTask(r);
      }),
    ),
  );
}

function renderRecorded(): void {
  recordedList.replaceChildren(
    ...(recording?.steps ?? []).map((st) => {
      const li = document.createElement("li");
      li.textContent = st.instruction;
      return li;
    }),
  );
}

async function loadButtons(): Promise<void> {
  const parsed = parseStore((await browser.storage.local.get(STORE_KEY))[STORE_KEY]);
  buttons = parsed.ok && where ? buttonsFor(parsed.store, where.site) : [];
  routes = parsed.ok && where ? routesFor(parsed.store, where.site) : [];
  renderShelf();
}

/** Re-read which page the tab shows and its buttons. */
async function refresh(): Promise<void> {
  tabId = await targetTab();
  where = await toPage<WhereReply>({ type: "anchor:where" });
  rememberButton.disabled = where === null;
  recordButton.disabled = where === null || recording !== null;
  await loadButtons();
  showNote(null);
  if (recording && where) {
    // Each page load starts a fresh content script: ask it to keep writing steps down.
    await toPage({ type: "anchor:record-start", afterInput: typedSoFar() });
    say(WORDS.recording);
    return;
  }
  if (await resumeGuide()) return;
  if (!where) say(WORDS.unsupported);
  else say(buttons.length || routes.length ? WORDS.ready : WORDS.empty);
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

// ---- Recording a task ----

function typedSoFar(): boolean {
  return recording?.steps.some((st) => st.kind === "your-turn") ?? false;
}

function stopRecordingUi(): void {
  recording = null;
  recorder.hidden = true;
  recordButton.disabled = where === null;
  renderRecorded();
}

recordButton.addEventListener("click", () => {
  void (async () => {
    if (!where) return;
    await stopGuide(false);
    showNote(null);
    taskForm.hidden = true;
    recording = { site: where.site, steps: [] };
    renderRecorded();
    recorder.hidden = false;
    recordButton.disabled = true;
    const ok = await toPage<{ ok: boolean }>({ type: "anchor:record-start", afterInput: false });
    if (!ok) {
      stopRecordingUi();
      say(WORDS.unsupported);
      return;
    }
    say(WORDS.recording);
  })();
});

$<HTMLButtonElement>("record-undo").addEventListener("click", () => {
  recording?.steps.pop();
  renderRecorded();
});

$<HTMLButtonElement>("record-cancel").addEventListener("click", () => {
  void toPage({ type: "anchor:record-stop" });
  stopRecordingUi();
  say(WORDS.recordCancelled);
});

$<HTMLButtonElement>("record-finish").addEventListener("click", () => {
  if (!recording) return;
  if (recording.steps.length === 0) {
    say(WORDS.recordEmpty);
    return;
  }
  void toPage({ type: "anchor:record-stop" });
  unnamed = recording;
  stopRecordingUi();
  taskForm.reset();
  taskForm.hidden = false;
  taskName.focus();
  say(WORDS.taskName);
});

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const draft = unnamed;
  if (!draft) return;
  void (async () => {
    const name = readNameField(taskName).trim() || "My task";
    const r = await toStore({
      type: "anchor:shelf-route-add",
      route: { id: crypto.randomUUID(), name, site: draft.site, steps: draft.steps },
    });
    if (r.ok) {
      unnamed = null;
      taskForm.hidden = true;
    }
    say(r.ok ? WORDS.taskSaved : WORDS.problem);
  })();
});

$<HTMLButtonElement>("task-cancel").addEventListener("click", () => {
  unnamed = null;
  taskForm.hidden = true;
  say(WORDS.recordCancelled);
});

async function removeTask(r: Route): Promise<void> {
  const reply = await toStore({ type: "anchor:shelf-route-remove", id: r.id });
  say(reply.ok ? WORDS.removed : WORDS.problem);
}

// ---- Guiding a task (M3 task 4) ----

async function startGuide(r: Route): Promise<void> {
  void r;
  await Promise.resolve();
}

async function stopGuide(announce: boolean): Promise<void> {
  void announce;
  await Promise.resolve();
}

async function resumeGuide(): Promise<boolean> {
  return Promise.resolve(false);
}

// ---- Always there ----

$<HTMLButtonElement>("show-original").addEventListener("click", () => {
  void (async () => {
    showNote(null);
    await toPage({ type: "anchor:show-original" });
    if (recording) stopRecordingUi();
    await stopGuide(false);
    say(WORDS.original);
  })();
});

$<HTMLButtonElement>("copy-note").addEventListener("click", () => {
  void navigator.clipboard.writeText(noteText.textContent ?? "").then(
    () => say(WORDS.copied),
    () => say(WORDS.copyFailed),
  );
});

// Events come from the content script of the tab this shelf is for.
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.tab?.id === undefined || sender.tab.id !== tabId) return undefined;
  const event = PageEventSchema.safeParse(message);
  if (!event.success) return undefined;
  const e = event.data;
  switch (e.type) {
    case "anchor:recorded":
      if (recording && e.step.fingerprint?.site === recording.site) {
        recording.steps.push(e.step);
        renderRecorded();
      }
      break;
    case "anchor:pick-cancelled":
      say(WORDS.pickCancelled);
      break;
    case "anchor:picked":
      pending = e.fingerprint;
      nameInput.defaultValue = displayName(pending);
      nameForm.reset();
      nameForm.hidden = false;
      $<HTMLDetailsElement>("helper").open = true;
      nameInput.focus();
      nameInput.select();
      say("What should this button be called?");
      break;
    default:
      break;
  }
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
