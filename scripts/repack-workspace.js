// Re-pack the agent workspace into uploads/<session>/ as manifest.json +
// chunk.NNN.json (each chunk <= CHUNK_BYTES decoded). Same ignore list and
// caps as the browser-side packer. Symlinks are skipped, never followed.
// env: ROOT = workspace directory, SID = session id.
const fs = require('fs');
const path = require('path');

const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build', '__pycache__',
  '.venv', 'venv', 'target', '.build', 'vendor', '.cargo', 'DerivedData', 'Pods', '.next', '.cache', '.idea']);
const IGNORE_RE = /^opencode-debug|\.dSYM$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB
const CHUNK_BYTES = 64 * 1024 * 1024;

const files = [];
let total = 0;
let stopped = false;

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
    files.push({ path: r, content: fs.readFileSync(p).toString('base64') });
  }
})(process.env.ROOT, '');

const chunks = [];
let cur = [];
let curBytes = 0;
for (const f of files) {
  const bytes = Math.ceil(f.content.length * 3 / 4);
  if (cur.length && curBytes + bytes > CHUNK_BYTES) {
    chunks.push(cur);
    cur = [];
    curBytes = 0;
  }
  cur.push(f);
  curBytes += bytes;
}
if (cur.length) chunks.push(cur);

const outDir = path.join('uploads', process.env.SID);
fs.mkdirSync(outDir, { recursive: true });
const names = [];
chunks.forEach((c, i) => {
  const name = 'chunk.' + String(i).padStart(3, '0') + '.json';
  fs.writeFileSync(path.join(outDir, name), JSON.stringify({ files: c }));
  names.push(name);
});
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ chunks: names }));

// Remove chunks from earlier turns that no longer exist (git add -A in the
// commit step will pick up the deletions).
for (const name of fs.readdirSync(outDir)) {
  if (name === 'manifest.json' || names.includes(name)) continue;
  fs.unlinkSync(path.join(outDir, name));
}
console.error('repacked ' + files.length + ' file(s) into ' + names.length + ' chunk(s), ' +
  (total / 1048576).toFixed(1) + ' MB');
