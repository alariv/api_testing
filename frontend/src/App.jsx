import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import TableCell from './components/TableCell';

// const API_URL = 'https://odds-composer.api.nbaproptool.com'
const API_URL = 'http://localhost:3001';

// Collapsible JSON Viewer Component
function JsonViewer({ data, level = 0 }) {
	const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

	if (typeof data !== 'object' || data === null) {
		return <span className='json-value'>{JSON.stringify(data)}</span>;
	}

	if (Array.isArray(data)) {
		if (data.length === 0) return <span className='json-array'>[]</span>;

		return (
			<div
				className='json-container clickable'
				onClick={(e) => {
					e.stopPropagation();
					setIsExpanded(!isExpanded);
				}}
			>
				<span className='json-toggle'>{isExpanded ? '▼' : '▶'}</span>
				<span className='json-bracket'>[</span>
				{isExpanded ? (
					<div className='json-content'>
						{data.map((item, index) => (
							<div
								key={index}
								className='json-item'
								style={{ marginLeft: '20px' }}
							>
								<JsonViewer data={item} level={level + 1} />
								{index < data.length - 1 && (
									<span className='json-comma'>,</span>
								)}
							</div>
						))}
					</div>
				) : (
					<span className='json-summary'>...{data.length} items</span>
				)}
				<span className='json-bracket'>]</span>
			</div>
		);
	}

	const keys = Object.keys(data);
	if (keys.length === 0) return <span className='json-object'>{'{}'}</span>;

	return (
		<div
			className='json-container clickable'
			onClick={(e) => {
				e.stopPropagation();
				setIsExpanded(!isExpanded);
			}}
		>
			<span className='json-toggle'>{isExpanded ? '▼' : '▶'}</span>
			<span className='json-bracket'>{'{'}</span>
			{isExpanded ? (
				<div className='json-content'>
					{keys.map((key, index) => (
						<div key={key} className='json-item' style={{ marginLeft: '20px' }}>
							<span className='json-key'>"{key}": </span>
							<JsonViewer data={data[key]} level={level + 1} />
							{index < keys.length - 1 && <span className='json-comma'>,</span>}
						</div>
					))}
				</div>
			) : (
				<span className='json-summary'>...{keys.length} properties</span>
			)}
			<span className='json-bracket'>{'}'}</span>
		</div>
	);
}

function App() {
	// State
	const [sseConnected, setSseConnected] = useState(false);
	const [pushedMessages, setPushedMessages] = useState([]);
	const [connectionCount, setConnectionCount] = useState(0);
	const [balanceLines, setBalanceLines] = useState({}); // Store balance lines for each cell
	const eventSourceRef = useRef(null);

	// Function to fetch connection count
	const fetchConnectionCount = async () => {
		try {
			const response = await fetch(`${API_URL}/api/status`);
			const data = await response.json();
			setConnectionCount(
				(data.websocketConnections || 0) + (data.sseConnections || 0)
			);
		} catch (error) {
			console.error('Error fetching connection count:', error);
		}
	};

	// Function to safely render message content
	const renderMessageContent = (msg) => {
		// If the message has a data property, show that
		if (msg.data) {
			return typeof msg.data === 'string' ? (
				msg.data
			) : (
				<JsonViewer data={msg.data} />
			);
		}
		// If the message has a message property, show that
		if (msg.message) {
			return typeof msg.message === 'string' ? (
				msg.message
			) : (
				<JsonViewer data={msg.message} />
			);
		}
		// Fallback to stringifying the entire message
		return <JsonViewer data={msg} />;
	};

	// Function to handle balance line changes
	const handleBalanceLineChange = (playerId, marketType, direction) => {
		// Get the original data to find available balance lines first
		const latestMessage = [...pushedMessages]
			.reverse()
			.find((msg) => msg.players && typeof msg.players === 'object');

		if (!latestMessage?.players?.[playerId]?.markets?.[marketType]) {
			return;
		}

		const availableBalanceLines = Object.keys(
			latestMessage.players[playerId].markets[marketType]
		)
			.map(Number)
			.filter((n) => !isNaN(n))
			.sort((a, b) => a - b);

		// Find the default balance line - prefer is_balanced: true, fallback to smallest
		let defaultBalanceLine = availableBalanceLines[0]; // fallback to smallest

		// Look for a balance line with is_balanced: true
		for (const balanceLine of availableBalanceLines) {
			if (
				latestMessage.players[playerId].markets[marketType][balanceLine]
					?.is_balanced === true
			) {
				defaultBalanceLine = balanceLine;
				break;
			}
		}

		setBalanceLines((prev) => {
			const key = `${playerId}-${marketType}`;
			const currentBalanceLine = prev[key] || defaultBalanceLine;

			let newBalanceLine = currentBalanceLine;

			if (direction === 'up') {
				// Find next higher balance line
				const currentIndex = availableBalanceLines.indexOf(currentBalanceLine);

				if (currentIndex === -1) {
					// If current balance line is not in available lines, start from the second smallest (index 1)
					// This makes the first click feel more like an "increase" action
					newBalanceLine =
						availableBalanceLines.length > 1
							? availableBalanceLines[1]
							: availableBalanceLines[0];
				} else if (currentIndex === availableBalanceLines.length - 1) {
					// If at highest, wrap around to smallest
					newBalanceLine = availableBalanceLines[0];
				} else {
					// Move to next higher balance line
					newBalanceLine = availableBalanceLines[currentIndex + 1];
				}
			} else if (direction === 'down') {
				// Find next lower balance line
				const currentIndex = availableBalanceLines.indexOf(currentBalanceLine);

				if (currentIndex === -1) {
					// If current balance line is not in available lines, start from the largest
					newBalanceLine =
						availableBalanceLines[availableBalanceLines.length - 1];
				} else if (currentIndex === 0) {
					// If at smallest, wrap around to highest
					newBalanceLine =
						availableBalanceLines[availableBalanceLines.length - 1];
				} else {
					// Move to next lower balance line
					newBalanceLine = availableBalanceLines[currentIndex - 1];
				}
			}

			// Force a state update by creating a new object
			const newState = {
				...prev,
				[key]: newBalanceLine
			};

			return newState;
		});
	};

	// Function to get current balance line for a cell
	const getCurrentBalanceLine = (playerId, marketType, defaultBalanceLine) => {
		const key = `${playerId}-${marketType}`;
		return balanceLines[key] || defaultBalanceLine;
	};

	// Function to get connection status
	const getConnectionStatus = () => {
		if (!eventSourceRef.current) return 'No connection';
		return eventSourceRef.current.readyState === EventSource.OPEN
			? 'Open'
			: 'Connecting';
	};

	// Log current connection status
	useEffect(() => {
		const logStatus = () => {
			console.log('Current SSE status:', getConnectionStatus());
			console.log('EventSource ref:', eventSourceRef.current);
		};

		// Log status every 10 seconds for debugging
		const statusInterval = setInterval(logStatus, 10000);

		return () => clearInterval(statusInterval);
	}, []);

	// SSE connection
	useEffect(() => {
		const connectSSE = () => {
			console.log('Creating new SSE connection...');
			const eventSource = new EventSource(`${API_URL}/api/events`);
			eventSourceRef.current = eventSource;

			eventSource.onopen = () => {
				console.log('SSE connected');
				setSseConnected(true);
				// Fetch connection count when connected
				fetchConnectionCount();
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					console.log('Received SSE message:', data);

					// Display all messages except connection and broadcast messages
					// Since backend forwards exact message, only filter out system messages
					if (
						!data.type ||
						(data.type !== 'connection' && data.type !== 'broadcast')
					) {
						const messageId = Date.now() + Math.random();
						const newMessage = { ...data, isNew: true, messageId };
						console.log(
							`[${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}` +
								'] data',
							JSON.stringify(data)
						);

						// Replace old messages with new data instead of accumulating
						setPushedMessages([newMessage]);

						// Remove the isNew flag after 10 seconds
						setTimeout(() => {
							setPushedMessages((prev) =>
								prev.map((msg) =>
									msg.messageId === messageId ? { ...msg, isNew: false } : msg
								)
							);
						}, 10000);
					}
					// Update connection count when receiving messages
					fetchConnectionCount();
				} catch (error) {
					console.error('Error parsing SSE message:', error);
				}
			};

			eventSource.onerror = (error) => {
				console.error('SSE error:', error);
				setSseConnected(false);
				// Try to reconnect after 3 seconds
				setTimeout(connectSSE, 3000);
			};

			// Handle connection close
			eventSource.onclose = () => {
				console.log('SSE connection closed');
				setSseConnected(false);
				// Try to reconnect after 3 seconds
				setTimeout(connectSSE, 3000);
			};
		};

		connectSSE();

		// Set up interval to refresh connection count
		const interval = setInterval(fetchConnectionCount, 5000);

		return () => {
			console.log('Cleaning up SSE connection...');
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			clearInterval(interval);
		};
	}, []);

	return (
		<div className='app'>
			<header className='app-header'>
				<h1>Messages from Backend</h1>
				<div className='ws-status'>
					SSE: {sseConnected ? '🟢 Connected' : '🔴 Disconnected'}
					{import.meta.env.DEV && (
						<span className='connection-count'>
							({connectionCount} connections)
						</span>
					)}
				</div>
			</header>

			<main className='app-main'>
				<div className='api-section'>
					<h2>Player Statistics</h2>
					<div className='player-table-container'>
						{(() => {
							// Find the most recent message with players data
							const latestMessage = [...pushedMessages]
								.reverse()
								.find((msg) => msg.players && typeof msg.players === 'object');

							if (!latestMessage || !latestMessage.players) {
								return (
									<p className='no-players'>
										No player data available. Send data with players object to
										see statistics.
									</p>
								);
							}

							// Convert players object to array and extract market data
							const playersArray = Object.values(latestMessage.players);

							return (
								<table className='player-table'>
									<thead>
										<tr>
											<th>Player</th>
											<th>Points</th>
											<th>Total Rebounds</th>
											<th>Assists</th>
											<th>Blocks</th>
											<th>Steals</th>
											<th>Turnovers</th>
											<th>3PT FG</th>
											<th>PRA</th>
											<th>PR</th>
											<th>PA</th>
											<th>BS</th>
											<th>RA</th>
										</tr>
									</thead>
									<tbody>
										{playersArray.map((player, index) => (
											<tr key={index}>
												<td className='player-name'>
													{player.player_name || 'N/A'}
												</td>
												<TableCell
													player={player}
													marketType='points'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='total_rebounds'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='assists'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='blocks'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='steals'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='turnovers'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='three_point_field_goal'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='pra'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='pr'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='pa'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='bs'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
												<TableCell
													player={player}
													marketType='ra'
													getCurrentBalanceLine={getCurrentBalanceLine}
													handleBalanceLineChange={handleBalanceLineChange}
												/>
											</tr>
										))}
									</tbody>
								</table>
							);
						})()}
					</div>
				</div>

				{/* <div className='api-section'>
					<h2>
						Messages Pushed from Backend
						<button
							onClick={() => setPushedMessages([])}
							className='api-button clear-button'
						>
							Clear Messages
						</button>
					</h2>
					<div className='ws-messages'>
						{pushedMessages.length === 0 ? (
							<p className='no-messages'>
								No messages pushed from backend yet. Messages will appear here
								in real-time when pushed from the backend.
							</p>
						) : (
							[...pushedMessages].reverse().map((msg, index) => (
								<div
									key={`${msg.messageId || index}-${msg.isNew ? 'new' : 'old'}`}
									className={`ws-message ${msg.type || msg.event} ${
										index === 0 ? 'latest' : ''
									} ${msg.isNew ? 'new-message' : ''}`}
								>
									<div hidden>{JSON.stringify(msg)}</div>
									<div className='message-header'>
										<span className='message-type'>
											{msg.event || msg.type || 'message'}
										</span>
										<span className='message-time'>
											{new Date(msg.timestamp).toLocaleTimeString()}
										</span>
									</div>
									<div className='message-content'>
										{renderMessageContent(msg)}
									</div>
								</div>
							))
						)}
					</div>
				</div> */}
			</main>
		</div>
	);
}

export default App;
