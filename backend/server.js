const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// Store SSE clients
const sseClients = new Set();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the React build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Server-Sent Events endpoint
app.get('/api/events', (req, res) => {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Cache-Control'
	});

	// Send initial connection message
	res.write(
		'data: {"type": "connection", "message": "SSE connected", "timestamp": "' +
			new Date().toISOString() +
			'"}\n\n'
	);

	// Store this client with better tracking
	const clientId = Date.now() + Math.random();
	const client = { id: clientId, res, connected: true };
	sseClients.add(client);

	console.log(`SSE client connected. Total clients: ${sseClients.size}`);

	// Handle client disconnect more reliably
	const cleanup = () => {
		if (client.connected) {
			client.connected = false;
			sseClients.delete(client);
			console.log(`SSE client disconnected. Total clients: ${sseClients.size}`);
		}
	};

	req.socket.on('close', cleanup);
	req.socket.on('error', cleanup);
	req.socket.on('end', cleanup);

	// Keep connection alive
	const keepAlive = setInterval(() => {
		if (client.connected) {
			res.write(':\n\n'); // SSE keep-alive comment
		} else {
			clearInterval(keepAlive);
		}
	}, 30000);

	req.socket.on('close', () => {
		clearInterval(keepAlive);
	});
});

// WebSocket connection handling
wss.on('connection', (ws) => {
	console.log('New WebSocket connection established');

	// Send welcome message to new client
	ws.send(
		JSON.stringify({
			type: 'connection',
			message: 'WebSocket connection established',
			timestamp: new Date().toISOString()
		})
	);

	// Handle incoming messages from client
	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);
			console.log('Received message:', data);

			// Echo the message back to all connected clients
			wss.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(
						JSON.stringify({
							type: 'broadcast',
							data: data,
							timestamp: new Date().toISOString()
						})
					);
				}
			});
		} catch (error) {
			console.error('Error parsing WebSocket message:', error);
		}
	});

	// Handle client disconnect
	ws.on('close', () => {
		console.log('WebSocket connection closed');
	});

	ws.onerror = (error) => {
		console.error('WebSocket error:', error);
	};
});

// Function to broadcast messages to all connected clients (WebSocket + SSE)
function broadcastToAll(message) {
	// Broadcast to WebSocket clients
	wss.clients.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(message));
		}
	});

	// Broadcast to SSE clients
	sseClients.forEach((client) => {
		try {
			client.res.write(`data: ${JSON.stringify(message)}\n\n`);
		} catch (error) {
			// Remove disconnected client
			sseClients.delete(client);
		}
	});
}

// API routes
app.get('/api/hello', (req, res) => {
	res.json({ message: 'Hello from the backend!' });
});

app.post('/api/data', (req, res) => {
	// Forward the exact request body to all connected clients
	broadcastToAll(req.body);

	res.json({
		message: 'Data received successfully!',
		receivedData: req.body,
		timestamp: new Date().toISOString()
	});
});

app.get('/api/status', (req, res) => {
	res.json({
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		websocketConnections: wss.clients.size,
		sseConnections: sseClients.size
	});
});

app.post('/api/push', (req, res) => {
	const { message, type = 'notification' } = req.body;

	if (!message) {
		return res.status(400).json({ error: 'Message is required' });
	}

	// Broadcast the message to all connected WebSocket clients
	broadcastToAll({
		type: type,
		message: message,
		timestamp: new Date().toISOString()
	});

	res.json({
		success: true,
		message: 'Data pushed to all connected clients',
		timestamp: new Date().toISOString()
	});
});

// Serve React app for all other routes (SPA routing)
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
	console.log(`Server URL: http://localhost:${PORT}`);
	console.log(`WebSocket URL: ws://localhost:${PORT}`);
	console.log(`SSE URL: http://localhost:${PORT}/api/events`);
	console.log(
		`Frontend served from: ${path.join(__dirname, '../frontend/dist')}`
	);
});
