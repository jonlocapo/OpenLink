// Re-pack the agent workspace into uploads/<session>/ as manifest.json +
// chunk.<hash>.json (each chunk <= CHUNK_BYTES decoded). Same ignore list and
// caps as the browser-side packer. Chunks are streamed to disk as they fill
// (bounded memory), content-addressed by a 64-bit FNV-1a of the payload, and
// the manifest is stamped {source:'runner', turn:n} so the UI accepts only
// fresh repacks. Symlinks are skipped, never followed.
// env: ROOT = workspace directory, SID = session id.
const fs = require('fs');
const path = require('path');

const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build', '__pycache__',
  '.venv', 'venv', 'target', '.build', 'vendor', '.cargo', 'DerivedData', 'Pods', '.next', '.cache', '.idea']);
const IGNORE_RE = /^opencode-debug|\.dSYM$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB
const CHUNK_BYTES = 8 * 1024 * 1024;       // 8 MiB decoded per chunk

// 64-bit FNV-1a (two lanes) — chunk identity, not security. Must match the
// browser's implementation so unchanged chunks keep their names across turns.
function fnv1a64(str) {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}

const outDir = path.join('uploads', process.env.SID);
fs.mkdirSync(outDir, { recursive: true });

// Turn stamp: continue the counter from our own previous repack.
let prevTurn = 0;
try {
  const old = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  if (old.source === 'runner') prevTurn = Number(old.turn) || 0;
} catch (e) { /* first repack */ }
const turn = prevTurn + 1;

const names = [];
let cur = [];
let curBytes = 0;
let total = 0;
let stopped = false;

function flushChunk() {
  if (!cur.length) return;
  const payload = JSON.stringify({ files: cur });
  const name = 'chunk.' + fnv1a64(payload) + '.json';
  fs.writeFileSync(path.join(outDir, name), payload);
  names.push(name);
  cur = [];
  curBytes = 0;
}

(function walk(dir, rel) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { console.error('skip dir', dir, e.message); return; }
  for (const name of entries) {
    if (stopped) return;
    if (IGNORE.has(name) || IGNORE_RE.test(name)) continue;
    const p = path.join(dir, name);
    const r = rel ? rel + '/' + name : name;
    let st;
    try { st = fs.lstatSync(p); } catch (e) { console.error('skip', r, e.message); continue; }
    if (st.isSymbolicLink()) { console.error('skip symlink', r); continue; }
    if (st.isDirectory()) { walk(p, r); continue; }
    if (st.size > MAX_FILE_BYTES) { console.error('skip large', r, st.size); continue; }
    total += st.size;
    if (total > MAX_TOTAL_BYTES) {
      console.error('size cap reached, stopped at', r);
      stopped = true;
      return;
    }
    const content = fs.readFileSync(p).toString('base64');
    const bytes = Math.ceil(content.length * 3 / 4);
    if (cur.length && curBytes + bytes > CHUNK_BYTES) flushChunk();
    cur.push({ path: r, content });
    curBytes += bytes;
  }
})(process.env.ROOT, '');
flushChunk();

// Remove chunks from earlier turns that no longer exist (git add -A in the
// commit step picks up the deletions).
const listed = new Set(names);
listed.add('manifest.json');
for (const name of fs.readdirSync(outDir)) {
  if (listed.has(name)) continue;
  try { fs.unlinkSync(path.join(outDir, name)); } catch (e) { /* ignore */ }
}

fs.writeFileSync(path.join(outDir, 'manifest.json'),
  JSON.stringify({ chunks: names, source: 'runner', turn }));
console.error('repacked ' + total + ' bytes into ' + names.length + ' chunk(s), turn ' + turn);
