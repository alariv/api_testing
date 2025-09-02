const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();
const { mockJson } = require('../../mock.js');
const { mockJson2 } = require('../../mock2.js');
const { mockJson3 } = require('../../mock3.js');
const { mockUpdateJson } = require('../../mockUpdateJson.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const mock =
	process.env.NODE_ENV === 'production' ? false : process.env.MOCK ?? false;
const PORT = process.env.PORT || 3001;

// Store SSE clients
const sseClients = new Set();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

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

const getMockJson = (update) => (update ? mockJson3 : mockJson);

let fixturesData = null;
app.post('/api/data', (req, res) => {
	console.log(`api/data received data: ${JSON.stringify(req.body)}`);
	// Forward the exact request body to all connected clients
	// broadcastToAll(req.body);
	const isUpdateReq = !!req.body?.player_id;
	const dataToUse = mock ? getMockJson(isUpdateReq) : req.body;
	console.log(
		`[${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}` +
			'] isUpdateReq',
		isUpdateReq
	);

	if (!isUpdateReq) {
		// Initial data - create new fixture data
		const data = {
			fixture_id: dataToUse?.fixture_id,
			players: {},
			isNew: dataToUse?.isNew,
			messageId: dataToUse?.messageId
		};

		//foreach player with market type
		dataToUse?.player_lines.forEach((playerMarket) => {
			//foreach existing player
			let matched = Object.keys(data.players).some(
				(playerId) => playerId == playerMarket.player_id
			);
			!matched &&
				console.log('matched', matched, playerMarket?.balance_line_over_odds);

			const marketObj = {
				balance_line: playerMarket?.balance_line,
				balance_line_over_odds: playerMarket?.balance_line_over_odds,
				balance_line_under_odds: playerMarket?.balance_line_under_odds,
				market_type: playerMarket?.market_type,
				player_name: playerMarket?.player_name,
				player_id: playerMarket?.player_id,
				is_balanced: playerMarket?.is_balanced,
				is_suspended: playerMarket?.is_suspended,
				is_closed: playerMarket?.is_closed,
				id: playerMarket?.id,
				market_column_suspension: playerMarket?.market_column_suspension,
				market_suspension: playerMarket?.market_suspension,
				milestone_line: playerMarket?.milestone_line,
				milestone_suspended: playerMarket?.milestone_suspended,
				milestone_over_odds: playerMarket?.milestone_over_odds,
				milestone_under_odds: playerMarket?.milestone_under_odds
			};

			if (!matched) {
				data.players[playerMarket.player_id] = {
					away_team_id: playerMarket?.away_team_id,
					away_team_name: playerMarket?.away_team_name,
					created_at: playerMarket?.created_at,
					fixture_id: playerMarket?.fixture_id,
					fixture_suspension: playerMarket?.fixture_suspension,
					game_date: playerMarket?.game_date,
					home_team_id: playerMarket?.home_team_id,
					home_team_name: playerMarket?.home_team_name,
					player_id: playerMarket?.player_id,
					player_name: playerMarket?.player_name,
					player_suspension: playerMarket?.player_suspension,
					player_team_id: playerMarket?.player_team_id,
					player_team_name: playerMarket?.player_team_name,
					published_at: playerMarket?.published_at,
					reliability: playerMarket?.reliability,
					sample_count: playerMarket?.sample_count,
					settlement_value: playerMarket?.settlement_value,
					status: playerMarket?.status,
					team_suspension: playerMarket?.team_suspension,
					updated_at: playerMarket?.updated_at,
					uuid: playerMarket?.uuid,
					markets: {
						[playerMarket.market_type]: {
							[playerMarket.balance_line]: marketObj
						}
					}
				};
			} else {
				//PLAYER EXISTED
				if (
					data.players[playerMarket.player_id].markets[playerMarket.market_type]
				) {
					data.players[playerMarket.player_id].markets[
						playerMarket.market_type
					][playerMarket.balance_line] = marketObj;
				} else {
					data.players[playerMarket.player_id].markets = {
						...data.players[playerMarket.player_id].markets,
						[playerMarket.market_type]: {
							[playerMarket.balance_line]: marketObj
						}
					};
				}
			}
		});

		// Store the fixture data for future updates
		fixturesData = data;

		// Add new_lines property for initial data
		const initialData = {
			...data,
			new_lines:
				dataToUse?.player_lines && Array.isArray(dataToUse?.player_lines)
					? dataToUse?.player_lines.length
					: 0
		};

		broadcastToAll(initialData);
	} else {
		// Update request - update existing fixture data
		if (!fixturesData) {
			return res
				.status(400)
				.json({ error: 'No existing fixture data to update' });
		}

		console.log(
			`[${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}` +
				'] fixturesData length when update req',
			Object.keys(fixturesData.players).length
		);

		const updateData = {
			...fixturesData,
			isUpdate: true,
			updateMessageId: dataToUse?.messageId || Date.now().toString(),
			new_lines:
				dataToUse?.lines && Array.isArray(dataToUse?.lines)
					? dataToUse?.lines.length
					: 0
		};

		if (dataToUse?.player_id && fixturesData.players[dataToUse?.player_id]) {
			const player = fixturesData.players[dataToUse?.player_id];
			if (dataToUse?.lines && Array.isArray(dataToUse?.lines)) {
				// Get the market type from the first line (all lines should have same market_type)
				const marketType = dataToUse?.lines[0]?.market_type;

				console.log(
					`Updating player ${dataToUse?.player_id}, market ${marketType} with ${dataToUse?.lines.length} lines`
				);

				if (marketType) {
					// Completely replace the existing market data for this player/market
					player.markets[marketType] = {};

					// Process each line in the array
					dataToUse?.lines.forEach((lineData) => {
						const balanceLine = lineData?.balance_line;

						if (balanceLine !== undefined) {
							// If this new line is balanced, set all other lines in this market to false
							if (lineData?.is_balanced) {
								Object.keys(player.markets[marketType]).forEach(
									(existingBalanceLine) => {
										if (player.markets[marketType][existingBalanceLine]) {
											player.markets[marketType][
												existingBalanceLine
											].is_balanced = false;
										}
									}
								);
							}

							player.markets[marketType][balanceLine] = {
								id: lineData?.id,
								fixture_id: lineData?.fixture_id,
								player_id: lineData?.player_id,
								sample_count: lineData?.sample_count,
								reliability: lineData?.reliability,
								status: lineData?.status,
								player_name: lineData?.player_name,
								market_type: lineData?.market_type,
								balance_line: lineData?.balance_line,
								milestone_line: lineData?.milestone_line,
								balance_line_over_odds: lineData?.balance_line_over_odds,
								balance_line_under_odds: lineData?.balance_line_under_odds,
								milestone_over_odds: lineData?.milestone_over_odds,
								milestone_under_odds: lineData?.milestone_under_odds,
								created_at: lineData?.created_at,
								updated_at: lineData?.updated_at,
								is_suspended: lineData?.is_suspended,
								is_balanced: lineData?.is_balanced,
								uuid: lineData?.uuid,
								player_team_name: lineData?.player_team_name,
								player_team_id: lineData?.player_team_id,
								home_team_id: lineData?.home_team_id,
								away_team_id: lineData?.away_team_id,
								home_team_name: lineData?.home_team_name,
								away_team_name: lineData?.away_team_name,
								game_date: lineData?.game_date,
								balance_line_under_settlement:
									lineData?.balance_line_under_settlement,
								milestone_over_settlement: lineData?.milestone_over_settlement,
								balance_line_over_settlement:
									lineData?.balance_line_over_settlement,
								settlement_value: lineData?.settlement_value,
								is_closed: lineData?.is_closed,
								balanced_line_suspended: lineData?.balanced_line_suspended,
								milestone_suspended: lineData?.milestone_suspended,
								fixture_suspension: lineData?.fixture_suspension,
								team_suspension: lineData?.team_suspension,
								player_suspesion: lineData?.player_suspesion,
								player_suspension: lineData?.player_suspension,
								market_suspension: lineData?.market_suspension,
								market_column_suspension: lineData?.market_column_suspension,
								published_at: lineData?.published_at
							};
						}
					});

					console.log(
						`Updated player ${dataToUse?.player_id}, market ${marketType}. New balance lines:`,
						Object.keys(player.markets[marketType])
					);
				}
			}
		}

		broadcastToAll(updateData);
	}

	console.log(
		`[${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}` +
			'] fixturesData.leng',
		fixturesData?.players?.length
	);

	res.json({
		message: 'Data received successfully!!!!!!!!!!!!!!!!',
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
