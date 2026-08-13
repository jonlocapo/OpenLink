// Extract assistant text from opencode NDJSON events to stdout and record the
// session id so the next run can resume this session.
// env: EVENTS_FILE = path to the NDJSON event stream,
//      SESSION_FILE = path where the session id should be stored (if missing).
const fs = require('fs');

let sessionID = '';
let out = '';
for (const line of fs.readFileSync(process.env.EVENTS_FILE, 'utf8').split('\n')) {
  if (!line) continue;
  try {
    const e = JSON.parse(line);
    if (e.sessionID && !sessionID) sessionID = e.sessionID;
    if (e.type === 'text' && e.part && e.part.text) out += e.part.text;
  } catch {}
}
if (sessionID && !fs.existsSync(process.env.SESSION_FILE)) {
  fs.writeFileSync(process.env.SESSION_FILE, sessionID);
}
process.stdout.write(out);
