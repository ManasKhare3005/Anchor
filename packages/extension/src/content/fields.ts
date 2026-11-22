import { accessibleNameOf, scrub } from "@anchor/matcher";
import type { FieldKind } from "../route.ts";

/**
 * Form fields: where the person types or chooses. Recording and guiding only ever note that a
 * field exists. Nothing here reads `.value` or what was typed (Hard Rule 7); the input type comes
 * from the `type` attribute.
 */

const BUTTON_TYPES = new Set(["submit", "button", "reset", "image"]);
const CHOICE_TYPES = new Set(["radio", "checkbox"]);

export function isField(el: Element): boolean {
  if (el.tagName === "SELECT" || el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  return type !== "hidden" && !BUTTON_TYPES.has(type);
}

export function fieldKind(el: Element): FieldKind {
  if (el.tagName === "SELECT") return "choose";
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  return el.tagName === "INPUT" && CHOICE_TYPES.has(type) ? "choose" : "type";
}

function isRadio(el: Element): boolean {
  return el.tagName === "INPUT" && (el.getAttribute("type") ?? "").toLowerCase() === "radio";
}

/**
 * The element a "your turn" step points at. For a radio button that is the group's first radio,
 * never the one the person chose: which option they picked is their answer, not a step.
 */
export function stepElementFor(field: Element): Element {
  if (!isRadio(field)) return field;
  const name = field.getAttribute("name");
  if (!name) return field;
  const scope = (field as HTMLInputElement).form ?? field.ownerDocument;
  for (const el of scope.querySelectorAll("input")) {
    if (isRadio(el) && el.getAttribute("name") === name) return el;
  }
  return field;
}

/**
 * The words naming a choice group, for the instruction: the fieldset legend or radiogroup label
 * ("Pickup store"), not the first option's label. Empty when there is none.
 */
export function groupLabelFor(field: Element): string {
  if (!isRadio(field)) return "";
  const group = field.closest("fieldset, [role='radiogroup']");
  if (!group) return "";
  const legend = group.tagName === "FIELDSET" ? group.querySelector(":scope > legend") : null;
  return scrub(accessibleNameOf(legend ?? group));
}
