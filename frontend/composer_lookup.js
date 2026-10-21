// H5: one compositor lookup contract for embedded tabs and native windows.
// Embedded editors use unique DOM IDs and data-tcs-id aliases; independent
// windows use their original IDs. Never search the document for another draft.
export function composerSelector(selector, embedded) {
  const raw=String(selector);
  return embedded ? raw.replace(/#([A-Za-z][A-Za-z0-9_-]*)/g,'[data-tcs-id="$1"]') : raw;
}
export function composerQuery(selector, scope=globalThis.document, embedded=false) {
  return scope.querySelector(scope===globalThis.document ? selector : composerSelector(selector,embedded));
}
export function composerQueryAll(selector, scope=globalThis.document, embedded=false) {
  return [...scope.querySelectorAll(scope===globalThis.document ? selector : composerSelector(selector,embedded))];
}
export function recipientNode(root,id) {
  return root.querySelector(`[data-tcs-id="${id}"]`) || root.querySelector(`#${id}`);
}
