// Unpack uploads/<session>/workspace.json into the agent workspace.
// env: SRC = path to workspace.json, DST = target directory.
// Prints the number of files written.
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(process.env.SRC, 'utf8'));
let n = 0;
for (const f of data.files || []) {
  const rel = String(f.path || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) continue;
  const p = path.join(process.env.DST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(f.content || '', 'base64'));
  n++;
}
console.log(n);
