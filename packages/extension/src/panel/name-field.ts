/**
 * Hard Rule 7 is about what the person types into websites. This is Anchor's own name field in
 * the side panel, where the helper types the name a button should have on the shelf. Reading it
 * is the purpose of the field, so it is the one audited place the panel reads `.value`.
 */
export function readNameField(input: HTMLInputElement): string {
  // eslint-disable-next-line no-restricted-syntax -- audited: Anchor's own name field, not a page input
  return input.value;
}
