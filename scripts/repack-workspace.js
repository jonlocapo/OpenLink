// Re-pack the agent workspace into uploads/<session>/workspace.json.
// env: ROOT = workspace directory, OUT = output file path.
const fs = require('fs');
const path = require('path');

const IGNORE = new Set(['.git']);
const files = [];
(function walk(dir, rel) {
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const p = path.join(dir, name);
    const r = rel ? rel + '/' + name : name;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, r);
    else files.push({ path: r, content: fs.readFileSync(p).toString('base64') });
  }
})(process.env.ROOT, '');
fs.writeFileSync(process.env.OUT, JSON.stringify({ files }));
