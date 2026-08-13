// Append an error event to the session NDJSON stream so the UI shows the
// failure instead of timing out silently.
// env: EVENTS_FILE, ERROR_TEXT, RC.
const fs = require('fs');

const ev = {
  type: 'error',
  sessionID: 'error-' + Date.now(),
  messageID: 'error-' + Date.now(),
  part: {
    type: 'text',
    text: 'Agent error (exit ' + (process.env.RC || '?') + '): ' +
          String(process.env.ERROR_TEXT || '').slice(0, 2000)
  }
};
try {
  fs.appendFileSync(process.env.EVENTS_FILE, JSON.stringify(ev) + '\n');
} catch (e) {
  console.error('append-error: ' + e.message);
}
