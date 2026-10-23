// Packs the built game (dist/) into one HTML file that opens with a double click.
// Opened from disk (file://), a browser refuses module scripts, fetches and fonts from neighbouring files,
// so everything goes inside the page: the bundle and styles inline, every texture, model and font as a data: URI,
// and a small shim that answers the game's requests for those files from the inlined copies.
// The normal dist/ build stays the one for Yandex Games.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const out = process.argv[2] || join(dist, '..', 'pirate-treasures2-standalone.html');
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.json': 'application/json' };

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(dist);
const dataUri = p => `data:${TYPES[extname(p)] || 'application/octet-stream'};base64,${readFileSync(p).toString('base64')}`;

// Files the game loads at runtime by path.
const assets = {};
for (const p of files) {
  const rel = relative(dist, p).split('\\').join('/');
  if (/^(textures|models)\//.test(rel)) assets[rel] = dataUri(p);
}

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = readFileSync(join(dist, html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1]), 'utf8');
const css = readFileSync(join(dist, html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1]), 'utf8');
const fonts = readFileSync(join(dist, 'fonts/fonts.css'), 'utf8').replace(/url\(\.\/([^)]+)\)/g, (_, f) => `url(${dataUri(join(dist, 'fonts', f))})`);

const shim = `
window.__ASSETS = ${JSON.stringify(assets)};
(() => {
  const A = window.__ASSETS, dir = location.href.replace(/[^/]*$/, '');
  const key = u => { try { const a = new URL(u, location.href).href; return a.startsWith(dir) ? decodeURI(a.slice(dir.length)) : null; } catch (e) { return null; } };
  const swap = u => { const k = typeof u === 'string' && key(u); return (k && A[k]) || u; };
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    const k = url && key(url);
    return k && A[k] ? realFetch(A[k]) : realFetch(input, init);
  };
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { get() { return d.get.call(this); }, set(v) { d.set.call(this, swap(v)); }, configurable: true });
})();`;

html = html
  .replace(/<link rel="stylesheet" href="\.\/fonts\/fonts\.css">/, () => `<style>${fonts}</style>`)
  .replace(/\s*<script type="module"[^>]*><\/script>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*assets\/[^>]*>/, () => `\n<style>${css}</style>`)
  .replace(/src="\.\/(textures\/[^"]+)"/g, (_, p) => `src="${assets[p]}"`)
  .replace('</head>', () => `<script>${shim}</script>\n</head>`)
  .replace('</body>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`);

writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1048576).toFixed(1)} MB, ${Object.keys(assets).length} files inside`);
