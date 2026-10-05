// Web Share Target: images shared from other apps arrive here as a multipart POST.
// They are kept briefly in Cache Storage (never sent anywhere) for the scan tab to read,
// which deletes them right after. Leftovers older than a day are removed.
const SHARE_CACHE = 'qr-studio-share';
const SHARE_PATH = '/share-target';
const MAX_FILES = 10;
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function pruneShared() {
  const cache = await caches.open(SHARE_CACHE);
  const now = Date.now();
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const at = Number(res && res.headers.get('x-shared-at'));
    if (!at || now - at > MAX_AGE_MS) await cache.delete(req);
  }
}

async function receiveShare(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.redirect('/?tab=scan&shared=error', 303);
  }
  const files = form
    .getAll('image')
    .filter((f) => f instanceof File && f.type.startsWith('image/') && f.size > 0 && f.size <= MAX_BYTES)
    .slice(0, MAX_FILES);
  // A new share replaces anything not read yet.
  await caches.delete(SHARE_CACHE);
  const cache = await caches.open(SHARE_CACHE);
  const at = String(Date.now());
  await Promise.all(
    files.map((file, i) =>
      cache.put(
        `${SHARE_PATH}/file/${i}`,
        new Response(file, { headers: { 'content-type': file.type, 'x-shared-at': at } }),
      ),
    ),
  );
  return Response.redirect(files.length ? '/?tab=scan&shared=1' : '/?tab=scan&shared=error', 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(event.request));
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(pruneShared());
});
