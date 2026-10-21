// The native window label is authoritative when Linux, Windows or macOS changes the app URL.
// The main window cannot accidentally become a composer.
export function nativeWindowRoute(search='', label='') {
  const match = /^(composer|reader)-([A-Za-z0-9_-]{1,96})$/.exec(String(label || ''));
  if (match) return {kind:match[1],key:match[2]};
  const q = new URLSearchParams(String(search || ''));
  const kind=q.get('native'), key=q.get('key');
  if (!['composer','reader'].includes(kind) || !/^[A-Za-z0-9_-]{1,96}$/.test(key||'')) return null;
  return {kind,key};
}
