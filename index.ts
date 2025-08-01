import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC07Gs8L5vxlUmC561PKbxthewA1mrxYDk",
  authDomain: "zylos-test.firebaseapp.com",
  databaseURL: "https://zylos-test-default-rtdb.firebaseio.com",
  projectId: "zylos-test",
  storageBucket: "zylos-test.firebasestorage.app",
  messagingSenderId: "553027007913",
  appId: "1:553027007913:web:2daa37ddf2b2c7c20b00b8"
};

// Enable CORS
app.use('/*', cors())

// HTML page
const htmlPage = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMD Controller</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #1e1e1e;
            color: #fff;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            color: #4CAF50;
        }
        .input-group {
            display: flex;
            margin-bottom: 20px;
        }
        #commandInput {
            flex: 1;
            padding: 10px;
            font-size: 16px;
            border: 1px solid #4CAF50;
            border-radius: 4px 0 0 4px;
            background-color: #2a2a2a;
            color: #fff;
        }
        #sendButton {
            padding: 10px 20px;
            font-size: 16px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
        }
        #sendButton:hover {
            background-color: #45a049;
        }
        #output {
            background-color: #000;
            border: 1px solid #4CAF50;
            border-radius: 4px;
            padding: 15px;
            min-height: 300px;
            max-height: 500px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
        }
        .command-line {
            margin-bottom: 10px;
        }
        .command {
            color: #4CAF50;
        }
        .result {
            color: #fff;
            margin-left: 20px;
        }
        .error {
            color: #ff5555;
        }
        .pending {
            color: #ffff55;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>CMD Controller</h1>
        <div class="input-group">
            <input type="text" id="commandInput" placeholder="أدخل أمر CMD هنا..." />
            <button id="sendButton">إرسال</button>
        </div>
        <div id="output"></div>
    </div>

    <script type="module">
        // Import Firebase
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
        import { getDatabase, ref, push, onValue, set } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

        // Initialize Firebase
        const firebaseConfig = ${JSON.stringify(firebaseConfig)};
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);

        const commandInput = document.getElementById('commandInput');
        const sendButton = document.getElementById('sendButton');
        const output = document.getElementById('output');

        // Send command
        async function sendCommand() {
            const command = commandInput.value.trim();
            if (!command) return;

            // Clear input
            commandInput.value = '';

            // Add to output
            const commandId = Date.now().toString();
            addToOutput(commandId, command, 'جاري التنفيذ...', 'pending');

            try {
                // Send command to server
                const response = await fetch('/api/command', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ command, commandId })
                });

                if (!response.ok) {
                    throw new Error('Failed to send command');
                }

                // Listen for result
                const resultRef = ref(database, 'results/' + commandId);
                const unsubscribe = onValue(resultRef, (snapshot) => {
                    const data = snapshot.val();
                    if (data && data.result) {
                        updateOutput(commandId, command, data.result, data.error ? 'error' : 'success');
                        unsubscribe();
                    }
                });

            } catch (error) {
                updateOutput(commandId, command, 'خطأ في إرسال الأمر', 'error');
            }
        }

        function addToOutput(id, command, result, type) {
            const commandLine = document.createElement('div');
            commandLine.className = 'command-line';
            commandLine.id = 'cmd-' + id;
            commandLine.innerHTML = \`
                <span class="command">> \${escapeHtml(command)}</span><br>
                <span class="result \${type}">\${escapeHtml(result)}</span>
            \`;
            output.appendChild(commandLine);
            output.scrollTop = output.scrollHeight;
        }

        function updateOutput(id, command, result, type) {
            const element = document.getElementById('cmd-' + id);
            if (element) {
                element.innerHTML = \`
                    <span class="command">> \${escapeHtml(command)}</span><br>
                    <span class="result \${type}">\${escapeHtml(result)}</span>
                \`;
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Event listeners
        sendButton.addEventListener('click', sendCommand);
        commandInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendCommand();
            }
        });
    </script>
</body>
</html>
`;

// Routes
app.get('/', (c) => {
  return c.html(htmlPage)
})

app.post('/api/command', async (c) => {
  const { command, commandId } = await c.json()
  
  // Save command to Firebase
  const commandData = {
    command,
    timestamp: Date.now(),
    status: 'pending'
  }
  
  // Send to Firebase Realtime Database
  await fetch(`${firebaseConfig.databaseURL}/commands/${commandId}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commandData)
  })
  
  return c.json({ success: true, commandId })
})

app.get('/api/pending', async (c) => {
  // Get pending commands from Firebase
  const response = await fetch(`${firebaseConfig.databaseURL}/commands.json?orderBy="status"&equalTo="pending"`)
  const data = await response.json()
  
  return c.json(data || {})
})

app.post('/api/result', async (c) => {
  const { commandId, result, error } = await c.json()
  
  // Update command status
  await fetch(`${firebaseConfig.databaseURL}/commands/${commandId}/status.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify('completed')
  })
  
  // Save result
  const resultData = {
    result,
    error: error || false,
    timestamp: Date.now()
  }
  
  await fetch(`${firebaseConfig.databaseURL}/results/${commandId}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(resultData)
  })
  
  return c.json({ success: true })
})

export default app