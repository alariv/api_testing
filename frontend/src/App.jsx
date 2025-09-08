import React, {
	useState,
	useEffect,
	useRef,
	useMemo,
	useCallback
} from 'react';
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
	const [activeTab, setActiveTab] = useState('balanced'); // Track active tab
	const [activeMilestoneMarket, setActiveMilestoneMarket] = useState('points'); // Track active milestone market tab
	const [specialsData, setSpecialsData] = useState(null); // Store specials data
	const [openAccordions, setOpenAccordions] = useState({}); // Track which accordions are open
	const eventSourceRef = useRef(null);
	const updateQueueRef = useRef([]); // Queue for handling rapid updates
	const isProcessingUpdatesRef = useRef(false); // Flag to prevent concurrent processing

	// Memoized calculations for performance
	const latestMessage = useMemo(() => {
		// Find the latest message with players data without creating new arrays
		for (let i = pushedMessages.length - 1; i >= 0; i--) {
			const msg = pushedMessages[i];
			if (msg.players && typeof msg.players === 'object') {
				return msg;
			}
		}
		return null;
	}, [pushedMessages]);

	const playersArray = useMemo(() => {
		if (!latestMessage || !latestMessage.players) return [];
		return Object.values(latestMessage.players).sort((a, b) => {
			const teamA = a.player_team_name || '';
			const teamB = b.player_team_name || '';
			return teamA.localeCompare(teamB);
		});
	}, [latestMessage]);

	const marketTypes = useMemo(
		() => [
			'points',
			'total_rebounds',
			'assists',
			'blocks',
			'steals',
			'turnovers',
			'three_point_field_goal',
			'pra',
			'pr',
			'pa',
			'bs',
			'ra'
		],
		[]
	);

	// Memoized milestone lines calculation for the active market
	const milestoneLines = useMemo(() => {
		if (!playersArray.length) return [];

		const allMilestoneLines = new Set();
		playersArray.forEach((player) => {
			const marketData = player.markets?.[activeMilestoneMarket];
			if (marketData) {
				Object.keys(marketData)
					.map(Number)
					.filter((n) => !isNaN(n))
					.forEach((lineKey) => {
						const lineData = marketData[lineKey];
						const milestoneLine = lineData?.milestone_line ?? lineKey;
						allMilestoneLines.add(milestoneLine);
					});
			}
		});

		return Array.from(allMilestoneLines).sort((a, b) => a - b);
	}, [playersArray, activeMilestoneMarket]);

	// Memoized specials data organized by market_type
	const specialsByMarketType = useMemo(() => {
		if (!specialsData?.specials) return {};

		const grouped = {};
		specialsData.specials.forEach((special) => {
			const marketType = special.market_type;
			if (!grouped[marketType]) {
				grouped[marketType] = [];
			}
			grouped[marketType].push(special);
		});

		// Sort each market type's selections by selection_name
		Object.keys(grouped).forEach((marketType) => {
			grouped[marketType].sort((a, b) =>
				(a.selection_name || '').localeCompare(b.selection_name || '')
			);
		});

		return grouped;
	}, [specialsData]);

	// Function to toggle accordion
	const toggleAccordion = (marketType) => {
		setOpenAccordions((prev) => ({
			...prev,
			[marketType]: !prev[marketType]
		}));
	};

	// Function to fetch connection count
	const fetchConnectionCount = async () => {
		try {
			const response = await fetch(`${API_URL}/api/status`);
			const data = await response.json();
			setConnectionCount(
				(data.websocketConnections || 0) + (data.sseConnections || 0)
			);
		} catch {
			// Error fetching connection count
		}
	};

	// Memoized function to handle balance line changes
	const handleBalanceLineChange = useCallback(
		(playerId, marketType, direction) => {
			// Use the memoized latestMessage instead of recalculating
			if (!latestMessage) return;

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
					const currentIndex =
						availableBalanceLines.indexOf(currentBalanceLine);

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
					const currentIndex =
						availableBalanceLines.indexOf(currentBalanceLine);

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
		},
		[latestMessage]
	);

	// Memoized function to get current balance line for a cell
	const getCurrentBalanceLine = useCallback(
		(playerId, marketType, defaultBalanceLine) => {
			const key = `${playerId}-${marketType}`;

			// If we have a stored balance line, use it
			if (balanceLines[key] !== undefined) {
				return balanceLines[key];
			}

			// Use the memoized latestMessage instead of recalculating
			if (!latestMessage) return defaultBalanceLine;

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
		},
		[balanceLines, latestMessage]
	);

	// Function to process updates sequentially to prevent state conflicts
	const processUpdateQueue = useCallback(async () => {
		if (isProcessingUpdatesRef.current || updateQueueRef.current.length === 0) {
			return;
		}

		isProcessingUpdatesRef.current = true;

		while (updateQueueRef.current.length > 0) {
			const data = updateQueueRef.current.shift();

			// Process the update
			await new Promise((resolve) => {
				setPushedMessages((prevMessages) => {
					if (data.isUpdate && data.players) {
						// Update existing message
						const existingMessage = prevMessages.find(
							(msg) => msg.players && !msg.isUpdate
						);

						if (existingMessage) {
							const updatedMessage = {
								...data,
								timestamp: new Date().toISOString()
							};

							// Reset balance line selections when update is received
							setBalanceLines({});

							// Check if update message also contains specials data
							if (data.specials) {
								setSpecialsData({
									fixture_id: data.fixture_id,
									specials: data.specials,
									isSpecials: true,
									specialsMessageId: data.messageId || Date.now().toString()
								});
							}

							const newMessages = prevMessages.map((msg) =>
								msg.players && !msg.isUpdate ? updatedMessage : msg
							);
							resolve();
							return newMessages;
						} else {
							const newMessages = [
								{
									...data,
									timestamp: new Date().toISOString()
								},
								...prevMessages
							];
							resolve();
							return newMessages;
						}
					} else if (data.players) {
						// Regular message with players data
						const newMessage = {
							...data,
							timestamp: new Date().toISOString(),
							isNew: true,
							messageId: data.messageId || Date.now().toString()
						};

						// Check if regular message also contains specials data
						if (data.specials) {
							setSpecialsData({
								fixture_id: data.fixture_id,
								specials: data.specials,
								isSpecials: true,
								specialsMessageId: data.messageId || Date.now().toString()
							});
						}

						resolve();
						return [newMessage, ...prevMessages];
					} else {
						resolve();
						return prevMessages;
					}
				});
			});

			// Small delay to prevent overwhelming the UI
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		isProcessingUpdatesRef.current = false;
	}, []);

	// Function to clear data on backend
	const handleClearData = async () => {
		try {
			const response = await fetch(`${API_URL}/api/clear`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				await response.json();

				// Clear frontend state
				setPushedMessages([]);
				setSpecialsData(null);
				setBalanceLines({});
				setOpenAccordions({});
			} else {
				console.error('Failed to clear data');
			}
		} catch (error) {
			console.error('Error clearing data:', error);
		}
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
						console.log(`Received data with ${data.new_lines} lines`);
					}

					// Check if this is specials data (but don't use else if, as message might contain both)
					if (data.isSpecials && data.specials) {
						setSpecialsData(data);
					}

					// Queue player data updates to prevent state conflicts from rapid updates
					if (data.players) {
						updateQueueRef.current.push(data);
						processUpdateQueue();
					}

					// Update connection count when receiving messages
					fetchConnectionCount();
				} catch {
					// Error parsing SSE message
				}
			};

			eventSource.onerror = () => {
				// SSE error
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
	}, [processUpdateQueue]);

	return (
		<div className='app'>
			<header className='app-header'>
				<div className='header-left'>
					<h1>Odds Composer API Testing</h1>
					<div className='ws-status'>
						SSE: {sseConnected ? '🟢 Connected' : '🔴 Disconnected'}
						{import.meta.env.DEV && (
							<span className='connection-count'>
								({connectionCount} connections)
							</span>
						)}
					</div>
				</div>
				<button
					className='clear-data-button'
					onClick={handleClearData}
					disabled={!sseConnected}
					title='Clear all data'
				>
					Flush data
				</button>
			</header>

			<main className='app-main'>
				{/* Tab Navigation */}
				<div className='tab-navigation'>
					<button
						className={`tab-button ${activeTab === 'balanced' ? 'active' : ''}`}
						onClick={() => setActiveTab('balanced')}
					>
						Balanced Lines
					</button>
					<button
						className={`tab-button ${
							activeTab === 'milestones' ? 'active' : ''
						}`}
						onClick={() => setActiveTab('milestones')}
					>
						Milestones
					</button>
					<button
						className={`tab-button ${activeTab === 'specials' ? 'active' : ''}`}
						onClick={() => setActiveTab('specials')}
					>
						Specials
					</button>
				</div>

				{/* Tab Content */}
				{activeTab === 'balanced' && (
					<div className='api-section'>
						<h2>Balanced Lines - fixture id: {latestMessage?.fixture_id}</h2>
						<div className='player-table-container'>
							{!latestMessage || !latestMessage.players ? (
								<p className='no-players'>
									No player data available. Send data with players object to see
									statistics.
								</p>
							) : (
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
										{playersArray.map((player) => (
											<tr key={player.player_id}>
												<td className='player-name'>
													<div>
														{player.player_name
															? `${player.player_name}`
															: 'N/A'}
													</div>
													{player?.player_team_name ? (
														<div className='player-team-name'>{`(${player.player_team_name})`}</div>
													) : null}
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
							)}
						</div>
					</div>
				)}

				{activeTab === 'milestones' && (
					<div className='api-section'>
						<h2>Milestones - fixture id: {latestMessage?.fixture_id}</h2>

						{/* Market Type Tabs */}
						<div className='market-tabs-navigation'>
							{marketTypes.map((marketType) => (
								<button
									key={marketType}
									className={`market-tab-button ${
										activeMilestoneMarket === marketType ? 'active' : ''
									}`}
									onClick={() => setActiveMilestoneMarket(marketType)}
								>
									{marketType
										.replace(/_/g, ' ')
										.replace(/\b\w/g, (l) => l.toUpperCase())}
								</button>
							))}
						</div>

						<div className='player-table-container'>
							{!latestMessage || !latestMessage.players ? (
								<p className='no-players'>
									No player data available. Send data with players object to see
									statistics.
								</p>
							) : (
								(() => {
									const sortedMilestoneLines = milestoneLines;

									if (sortedMilestoneLines.length === 0) {
										return (
											<p className='no-players'>
												No milestone data available for this market.
											</p>
										);
									}

									return (
										<table className='player-table'>
											<thead>
												<tr>
													<th>Player</th>
													{sortedMilestoneLines.map((milestoneLine) => (
														<th key={milestoneLine}>
															<div>TO</div>
															<div>REACH: {milestoneLine}</div>
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{playersArray.map((player) => {
													const marketData =
														player.markets?.[activeMilestoneMarket];
													if (!marketData) {
														return (
															<tr key={`${player.player_id}-no-data`}>
																<td className='player-name'>
																	<div>
																		{player.player_name
																			? `${player.player_name}`
																			: 'N/A'}
																	</div>
																	{player?.player_team_name && (
																		<div className='player-team-name'>{`(${player.player_team_name})`}</div>
																	)}
																</td>
																{sortedMilestoneLines.map((_, index) => (
																	<td
																		key={`${player.player_id}-no-data-${index}`}
																	>
																		N/A
																	</td>
																))}
															</tr>
														);
													}

													// Check if any milestone for this player is suspended
													const hasSuspendedMilestone =
														sortedMilestoneLines.some((milestoneLine) => {
															const matchingLine = Object.values(
																marketData
															).find(
																(lineData) =>
																	(lineData?.milestone_line ??
																		lineData?.line_key) === milestoneLine
															);
															return matchingLine?.is_suspended === 1;
														});

													return (
														<tr key={player.player_id}>
															<td
																className={`player-name ${
																	hasSuspendedMilestone ? 'suspended' : ''
																}`}
															>
																<div>
																	{player.player_name
																		? `${player.player_name}`
																		: 'N/A'}
																</div>
																{player?.player_team_name ? (
																	<div className='player-team-name'>{`(${player.player_team_name})`}</div>
																) : null}
															</td>
															{sortedMilestoneLines.map((milestoneLine) => {
																// Find the line data that matches this milestone line
																const matchingLine = Object.values(
																	marketData
																).find(
																	(lineData) =>
																		(lineData?.milestone_line ??
																			lineData?.line_key) === milestoneLine
																);

																return (
																	<td
																		key={`${player.player_id}-${milestoneLine}`}
																		className={`milestone-odds ${
																			matchingLine?.is_suspended === 1
																				? 'suspended'
																				: ''
																		}`}
																	>
																		<div className='milestone-odds-content'>
																			<div className='milestone-odds-value'>
																				{matchingLine?.milestone_over_odds ??
																					'N/A'}
																			</div>
																			<div className='milestone-settlements'>
																				<div
																					className={`milestone-settlement-circle ${
																						matchingLine?.milestone_over_settlement ===
																						'W'
																							? 'win'
																							: matchingLine?.milestone_over_settlement ===
																							  'L'
																							? 'loss'
																							: 'neutral'
																					}`}
																					title={`Milestone over settlement: ${
																						matchingLine?.milestone_over_settlement ||
																						'N/A'
																					}`}
																				>
																					{matchingLine?.settlement_value ?? ''}
																				</div>
																			</div>
																		</div>
																	</td>
																);
															})}
														</tr>
													);
												})}
											</tbody>
										</table>
									);
								})()
							)}
						</div>
					</div>
				)}

				{/* Specials Tab Content */}
				{activeTab === 'specials' && (
					<div className='api-section'>
						<h2>Specials Data</h2>
						{specialsData ? (
							<div className='specials-container'>
								<div className='specials-accordions'>
									{Object.keys(specialsByMarketType).map((marketType) => (
										<div key={marketType} className='accordion'>
											<button
												className='accordion-header'
												onClick={() => toggleAccordion(marketType)}
											>
												<span className='market-type-name'>
													{marketType
														.replace(/_/g, ' ')
														.replace(/\b\w/g, (l) => l.toUpperCase())}
												</span>
												<span className='accordion-count'>
													({specialsByMarketType[marketType].length})
												</span>
											</button>
											{openAccordions[marketType] && (
												<div className='accordion-content'>
													<table className='specials-table'>
														<thead>
															<tr>
																<th>Selection Name</th>
																<th>Odds</th>
																<th>Probability</th>
																<th>Status</th>
																<th>Suspended</th>
															</tr>
														</thead>
														<tbody>
															{specialsByMarketType[marketType].map(
																(special) => (
																	<tr
																		key={special.id}
																		className='selection-row'
																	>
																		<td className='selection-name'>
																			{special.selection_name || 'N/A'}
																		</td>
																		<td className='odds'>
																			{special.odds || 'N/A'}
																		</td>
																		<td className='probability'>
																			{special.probability || 'N/A'}
																		</td>
																		<td className='status'>
																			<span
																				className={`status-badge ${special.status}`}
																			>
																				{special.status || 'N/A'}
																			</span>
																		</td>
																		<td className='suspended'>
																			{special.is_suspended === 1 ? (
																				<span className='suspended-badge'>
																					SUSPENDED
																				</span>
																			) : (
																				<span className='active-badge'>
																					ACTIVE
																				</span>
																			)}
																		</td>
																	</tr>
																)
															)}
														</tbody>
													</table>
												</div>
											)}
										</div>
									))}
								</div>
							</div>
						) : (
							<div className='no-specials'>
								<p>No specials data received yet.</p>
							</div>
						)}
					</div>
				)}

				{/* Messages section removed for performance optimization */}
			</main>
		</div>
	);
}

export default App;
