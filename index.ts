// index.ts ---------------------------------------------------------------
import { Hono } from 'hono'
import { nanoid } from 'nanoid'

const app = new Hono()

/* ---------------------------------------------------------------------- */
/* Firebase helpers – no SDK, use REST so we keep everything in this file */
/* ---------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyC07Gs8L5vxlUmC561PKbxthewA1mrxYDk",
  authDomain: "zylos-test.firebaseapp.com",
  databaseURL: "https://zylos-test-default-rtdb.firebaseio.com",
  projectId: "zylos-test",
  storageBucket: "zylos-test.firebasestorage.app",
  messagingSenderId: "553027007913",
  appId: "1:553027007913:web:2daa37ddf2b2c7c20b00b8"
}

const DB = firebaseConfig.databaseURL

// convenience
const fb = (path: string, init?: RequestInit) =>
  fetch(`${DB}/${path}.json`, init)

/* ------------------------------------------ */
/* 1. Web UI (single HTML page, no bundler)   */
/* ------------------------------------------ */
const HTML = /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Remote CMD Console</title>
  <style>
    body{font-family:system-ui;padding:2rem;max-width:700px;margin:auto}
    input[type=text]{width:80%;padding:.6rem;font-size:1rem}
    button{padding:.6rem 1.2rem;margin-left:.5rem}
    pre{background:#111;color:#0f0;padding:1rem;white-space:pre-wrap}
  </style>
  <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js"></script>
</head>
<body>
  <h1>Remote CMD Console</h1>
  <input id="cmd" placeholder="e.g. ipconfig" />
  <button onclick="send()">Run</button>
  <pre id="out"></pre>

<script>
  /* --- client-side Firebase (read-only for commands/responses) -- */
  const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)}
  firebase.initializeApp(firebaseConfig)
  const db = firebase.database()

  let currentId = null

  function send(){
    const cmd = document.getElementById('cmd').value.trim()
    if(!cmd) return
    currentId = crypto.randomUUID()
    firebase.database().ref('/commands/'+currentId).set({
      cmd, status:'pending', ts:Date.now()
    })
    document.getElementById('out').textContent = 'Waiting for agent...'
    watchResponse()
  }

  function watchResponse(){
    if(!currentId) return
    firebase.database().ref('/responses/'+currentId).on('value', snap=>{
      if(!snap.exists()) return
      document.getElementById('out').textContent = snap.val().output
    })
  }
</script>
</body>
</html>`

app.get('/', c => c.html(HTML))

/* ------------------------------------------ */
/* 2. REST API consumed by the Python client  */
/* ------------------------------------------ */

/* (a) Agent asks for next job */
app.get('/api/next', async c => {
  // simple "first pending" query
  const res = await fb('commands.json?orderBy="status"&equalTo="pending"&limitToFirst=1')
  const data = await res.json() as Record<string, any> | null
  if (!data) return c.json({ job: null })

  const [id, job] = Object.entries(data)[0]
  await fb(`commands/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'running' })
  })
  return c.json({ id, cmd: job.cmd })
})

/* (b) Agent posts its result */
app.post('/api/respond', async c => {
  const { id, output } = await c.req.json()
  if (!id || !output) return c.json({ ok:false, error:'Bad payload'}, 400)

  await Promise.all([
    fb(`responses/${id}`, { method:'PUT', body: JSON.stringify({ output, ts:Date.now() }) }),
    fb(`commands/${id}`,  { method:'PATCH', body: JSON.stringify({ status:'done' }) })
  ])

  return c.json({ ok:true })
})

/* (c) Web UI could hit this endpoint too (not required) */
app.post('/api/command', async c=>{
  const { cmd } = await c.req.json()
  const id = nanoid()
  await fb(`commands/${id}`, { method:'PUT', body: JSON.stringify({ cmd, status:'pending', ts:Date.now() }) })
  return c.json({ id })
})

export default app
// ------------------------------------------------------------------------