# TCS Mail h3 — multiple independent composition tabs

- First tab is pinned read-only preview of the selected message; title follows current message.
- Every new message/reply/forward uses a distinct draftId and own live editor.
- Selecting another message always activates pinned reading tab, never migrates editors.
- Detached window transfer restores into a new tab; conflicts on the **same draftId** are rejected.
- Closing a draft uses existing modal requestClose guard (cancel, discard, save).
- Theme colors use existing CSS variables; no fixed blue background.

## Honesty and validation
Node syntax, static UI contracts and packaging can be verified without Rust.
Rust compilation, cross-window native handshake and GNOME/WebKitGTK visual checks remain pending on the user's station.
