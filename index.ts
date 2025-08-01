import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, query, orderByChild, equalTo, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

// Firebase config (initialized server-side only)
const firebaseConfig = {
  apiKey: "AIzaSyC07Gs8L5vxlUmC561PKbxthewA1mrxYDk",
  authDomain: "zylos-test.firebaseapp.com",
  databaseURL: "https://zylos-test-default-rtdb.firebaseio.com",
  projectId: "zylos-test",
  storageBucket: "zylos-test.firebasestorage.app",
  messagingSenderId: "553027007913",
  appId: "1:553027007913:web:2daa37ddf2b2c7c20b00b8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const honoApp = new Hono();

// Embedded HTML page (served at root '/')
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Remote CMD Control</title>
  <style>body { font-family: Arial; } #output { margin-top: 20px; border: 1px solid #ccc; padding: 10px; }</style>
</head>
<body>
  <h1>Remote CMD Control</h1>
  <input type="text" id="command" placeholder="Enter CMD command (e.g., echo Hello)">
  <button onclick="sendCommand()">Send</button>
  <div id="output"></div>

  <script>
    async function sendCommand() {
      const cmd = document.getElementById('command').value;
      const id = crypto.randomUUID(); // Generate UUID
      const response = await fetch('/api/send-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, command: cmd })
      });
      if (response.ok) {
        document.getElementById('output').innerText = 'Command sent. Polling for response...';
        pollResponse(id);
      } else {
        document.getElementById('output').innerText = 'Error sending command.';
      }
    }

    async function pollResponse(id) {
      const interval = setInterval(async () => {
        const response = await fetch('/api/get-response/' + id);
        const data = await response.json();
        if (data.output) {
          document.getElementById('output').innerText = 'Response: ' + data.output;
          clearInterval(interval);
        }
      }, 2000); // Poll every 2 seconds
    }
  </script>
</body>
</html>
`;

// Route: Serve HTML page
honoApp.get('/', (c) => c.html(html));

// API: Send command (called by frontend, writes to Firebase)
honoApp.post('/api/send-command', async (c) => {
  const { id, command } = await c.req.json();
  if (!id || !command) return c.json({ error: 'Invalid request' }, 400);
  await set(ref(db, `/commands/${id}`), { command, status: 'pending' });
  return c.json({ success: true });
});

// API: Get response (called by frontend, reads from Firebase)
honoApp.get('/api/get-response/:id', async (c) => {
  const id = c.req.param('id');
  const snapshot = await get(ref(db, `/responses/${id}`));
  if (snapshot.exists()) {
    return c.json(snapshot.val());
  }
  return c.json({ output: null });
});

// API: Get pending commands (called by Python client, reads pending from Firebase)
honoApp.get('/api/commands', async (c) => {
  const pendingQuery = query(ref(db, '/commands'), orderByChild('status'), equalTo('pending'));
  const snapshot = await get(pendingQuery);
  const commands = [];
  snapshot.forEach((child) => {
    commands.push({ id: child.key, command: child.val().command });
  });
  return c.json(commands);
});

// API: Submit response (called by Python client, writes to Firebase and updates status)
honoApp.post('/api/respond', async (c) => {
  const { id, output } = await c.req.json();
  if (!id || !output) return c.json({ error: 'Invalid request' }, 400);
  await set(ref(db, `/responses/${id}`), { output });
  await update(ref(db, `/commands/${id}`), { status: 'processed' });
  return c.json({ success: true });
});

export default honoApp;