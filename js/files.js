// Attachments: boarding passes, QR codes, confirmations.
// PDFs are turned into page pictures when attached, so they can be shown offline on every phone.
import { store } from './store.js';
import { loadScript } from './util.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

const toBlob = (canvas, q = 0.88) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));

async function shrinkImage(file, maxSide) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 2.5e6) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return toBlob(c);
}

async function pdfPages(file, maxPages, scale) {
  await loadScript(PDFJS + 'pdf.min.js');
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(await toBlob(c));
  }
  return out;
}

// Returns an attachment record: { name, kind, url, path, pages: [{url, path}] }
export async function processAttachment(code, file) {
  const local = store.mode === 'local';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const blobs = await pdfPages(file, local ? 3 : 8, local ? 1.3 : 2);
    const pages = [];
    for (const [i, b] of blobs.entries()) pages.push(await store.upload(code, b, `${file.name}-p${i + 1}.jpg`));
    const original = local ? { url: '', path: '' } : await store.upload(code, file, file.name);
    return { name: file.name, kind: 'pdf', ...original, pages };
  }
  if (file.type.startsWith('image/')) {
    const img = await shrinkImage(file, local ? 1400 : 2400);
    return { name: file.name, kind: 'image', ...(await store.upload(code, img, file.name.replace(/\.\w+$/, '') + '.jpg')), pages: [] };
  }
  throw new Error('Please attach a photo, screenshot or PDF.');
}

export async function deleteAttachment(a) {
  await store.deleteFile(a.path);
  for (const p of a.pages || []) await store.deleteFile(p.path);
}

export const pictureUrls = (a) => (a.kind === 'pdf' ? (a.pages || []).map((p) => p.url) : [a.url]).filter(Boolean);

// Save every attachment picture on this phone so it opens in the subway.
const FILE_CACHE = 'tp-files';
export async function cacheAttachments(events) {
  if (!('caches' in window) || !navigator.onLine) return;
  const urls = events.flatMap((e) => (e.attachments || []).flatMap(pictureUrls)).filter((u) => u.startsWith('http'));
  if (!urls.length) return;
  try {
    const cache = await caches.open(FILE_CACHE);
    for (const u of urls) {
      if (await cache.match(u)) continue;
      try { await cache.put(u, await fetch(u, { mode: 'no-cors' })); } catch { /* try again next time */ }
    }
  } catch { /* storage blocked */ }
}
