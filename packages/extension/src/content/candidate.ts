/** The nearest element the matcher would consider, from an event target upward (across shadow roots). */
export function candidateFor(target: EventTarget | null, candidates: Set<Element>): Element | null {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (candidates.has(node)) return node;
    const parent: Element | null = node.parentElement;
    if (parent) {
      node = parent;
      continue;
    }
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

/** The innermost real target of an event, inside open shadow roots too. */
export function targetOf(e: Event): EventTarget | null {
  return e.composedPath()[0] ?? e.target;
}
