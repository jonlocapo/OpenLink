// Append an error event to the session NDJSON stream so the UI shows the
// failure instead of timing out silently.
// env: EVENTS_FILE, ERROR_TEXT, RC (a numeric exit code, or absent when the
// failure has no exit status — e.g. a cancelled/timed-out job, whose message
// is already self-describing and shouldn't be prefixed "exit timeout").
const fs = require('fs');

const rc = String(process.env.RC || '');
const prefix = /^\d+$/.test(rc) ? 'Agent error (exit ' + rc + '): ' : '';
const ev = {
  type: 'error',
  sessionID: 'error-' + Date.now(),
  messageID: 'error-' + Date.now(),
  part: {
    type: 'text',
    text: prefix + String(process.env.ERROR_TEXT || '').slice(0, 2000)
  }
};
try {
  fs.appendFileSync(process.env.EVENTS_FILE, JSON.stringify(ev) + '\n');
} catch (e) {
  console.error('append-error: ' + e.message);
}
