import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import TableCell from './components/TableCell';

// const API_URL = 'https://odds-composer.api.nbaproptool.com'
const API_URL = import.meta.env.DEV
	? 'http://localhost:3001'
	: 'https://odds-composer.api.nbaproptool.com';

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

		setBalanceLines((prev) => {
			const key = `${playerId}-${marketType}`;

			// Get the current balance line from state, or find the balanced line from data
			let currentBalanceLine = prev[key];
			if (currentBalanceLine === undefined) {
				// Find the balanced line (is_balanced: true) from the available data
				const balancedLine = availableBalanceLines.find((balanceLine) => {
					const marketData =
						latestMessage.players[playerId].markets[marketType][balanceLine];
					return marketData && marketData.is_balanced === true;
				});
				currentBalanceLine = balancedLine || availableBalanceLines[0];
			}

			let newBalanceLine = currentBalanceLine;

			if (direction === 'up') {
				// Find next higher balance line
				const currentIndex = availableBalanceLines.indexOf(currentBalanceLine);

				if (currentIndex === -1) {
					// If current balance line is not in available lines, find the next higher one
					const nextHigher = availableBalanceLines.find(
						(line) => line > currentBalanceLine
					);
					newBalanceLine = nextHigher || availableBalanceLines[0];
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
					// If current balance line is not in available lines, find the next lower one
					const nextLower = availableBalanceLines.find(
						(line) => line < currentBalanceLine
					);
					newBalanceLine =
						nextLower ||
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

		// If we have a stored balance line, use it
		if (balanceLines[key] !== undefined) {
			return balanceLines[key];
		}

		// Otherwise, find the balanced line from the latest message data
		const latestMessage = [...pushedMessages]
			.reverse()
			.find((msg) => msg.players && typeof msg.players === 'object');

		if (latestMessage?.players?.[playerId]?.markets?.[marketType]) {
			const availableBalanceLines = Object.keys(
				latestMessage.players[playerId].markets[marketType]
			)
				.map(Number)
				.filter((n) => !isNaN(n))
				.sort((a, b) => a - b);

			// Find the balanced line (is_balanced: true)
			const balancedLine = availableBalanceLines.find((balanceLine) => {
				const marketData =
					latestMessage.players[playerId].markets[marketType][balanceLine];
				return marketData && marketData.is_balanced === true;
			});

			return balancedLine || defaultBalanceLine;
		}

		return defaultBalanceLine;
	};

	// SSE connection
	useEffect(() => {
		const connectSSE = () => {
			const eventSource = new EventSource(`${API_URL}/api/events`);
			eventSourceRef.current = eventSource;

			eventSource.onopen = () => {
				setSseConnected(true);
				// Fetch connection count when connected
				fetchConnectionCount();
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					// Log new_lines value if present
					if (data.new_lines !== undefined) {
						if (data.new_lines == 1) {
							console.warn(`Received data with ${data.new_lines} lines`);
							console.warn(data);
						} else {
							console.log(`Received data with ${data.new_lines} lines`);
						}
					}

					// Check if this is an update message
					if (data.isUpdate && data.players) {
						// This is an update - merge with existing data
						setPushedMessages((prevMessages) => {
							const existingMessage = prevMessages.find(
								(msg) => msg.players && !msg.isUpdate
							);

							if (existingMessage) {
								// Update the existing message with new data
								const updatedMessage = {
									...existingMessage,
									...data,
									timestamp: new Date().toISOString()
								};

								// Reset balance line selections when update is received
								// This ensures the new balanced line is displayed
								setBalanceLines({});

								// Replace the existing message with the updated one
								return prevMessages.map((msg) =>
									msg.players && !msg.isUpdate ? updatedMessage : msg
								);
							} else {
								// No existing message, add as new
								return [
									{
										...data,
										timestamp: new Date().toISOString()
									}
								];
							}
						});
					} else {
						// Regular message - add to messages
						const newMessage = {
							...data,
							timestamp: new Date().toISOString(),
							isNew: true,
							messageId: data.messageId || Date.now().toString()
						};

						setPushedMessages([newMessage]);

						// Remove the isNew flag after 10 seconds
						setTimeout(() => {
							setPushedMessages((prev) =>
								prev.map((msg) =>
									msg.messageId === newMessage.messageId
										? { ...msg, isNew: false }
										: msg
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
				setSseConnected(false);
				// Try to reconnect after 3 seconds
				setTimeout(connectSSE, 3000);
			};
		};

		connectSSE();

		// Set up interval to refresh connection count
		const interval = setInterval(fetchConnectionCount, 5000);

		return () => {
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
				<h1>Odds Composer API Testing</h1>
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

				{/* Messages section removed for performance optimization */}
			</main>
		</div>
	);
}

export default App;
