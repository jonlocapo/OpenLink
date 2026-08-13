// Unpack uploads/<session>/ (manifest.json + chunk.NNN.json) into the agent
// workspace. Deletes chunk files not listed in the manifest so stale chunks
// from earlier turns never leak into the workspace or the write-back.
// env: SID = session id, DST = target directory.
// Prints the number of files written.
const fs = require('fs');
const path = require('path');

const srcDir = path.join('uploads', process.env.SID);
let manifest = { chunks: [] };
try {
  manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
} catch (e) { /* no manifest → empty workspace */ }

let n = 0;
for (const name of manifest.chunks || []) {
  if (!/^chunk\.\d{3}\.json$/.test(String(name))) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(srcDir, name), 'utf8'));
  } catch (e) { continue; }
  for (const f of data.files || []) {
    const rel = String(f.path || '').replace(/\\/g, '/');
    if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) continue;
    const p = path.join(process.env.DST, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(f.content || '', 'base64'));
    n++;
  }
}

// Clean up stale files in uploads/<session>/ (old chunk counts, legacy
// workspace.json from before chunking).
const listed = new Set(manifest.chunks || []);
listed.add('manifest.json');
let removed = 0;
try {
  for (const name of fs.readdirSync(srcDir)) {
    if (!listed.has(name)) {
      fs.unlinkSync(path.join(srcDir, name));
      removed++;
    }
  }
} catch (e) { /* dir missing */ }

if (removed) console.error('removed ' + removed + ' stale upload file(s)');
console.log(n);
