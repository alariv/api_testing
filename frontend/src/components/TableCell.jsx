import React from 'react';

const TableCell = ({
	player,
	marketType,
	getCurrentBalanceLine,
	handleBalanceLineChange,
	isBlinking = false
}) => {
	const marketData = player.markets?.[marketType];
	if (!marketData) return <td>N/A</td>;

	const availableBalanceLines = Object.keys(marketData)
		.map(Number)
		.filter((n) => !isNaN(n))
		.sort((a, b) => a - b);

	if (availableBalanceLines.length === 0) return <td>N/A</td>;

	// Find the default balance line - prefer is_balanced: true, fallback to smallest
	let defaultBalanceLine = availableBalanceLines[0]; // fallback to smallest

	// Look for a balance line with is_balanced: true
	for (const balanceLine of availableBalanceLines) {
		if (marketData[balanceLine]?.is_balanced === true) {
			defaultBalanceLine = balanceLine;
			break;
		}
	}

	const currentBalanceLine = getCurrentBalanceLine(
		player.player_id,
		marketType,
		defaultBalanceLine
	);

	// Create a unique key that changes when the balance line changes
	const cellKey = `${player.player_id}-${marketType}-${currentBalanceLine}`;

	return (
		<td key={cellKey} className={`market-${marketType}`}>
			<div
				className={`odds-widget market-${marketType} ${
					marketData[currentBalanceLine]?.is_balanced ? 'balanced' : ''
				} ${marketData[currentBalanceLine]?.is_suspended ? 'suspended' : ''} ${
					isBlinking ? 'blinking' : ''
				}`}
			>
				<div className='odds-arrows'>
					<div
						className='arrow-up'
						onClick={() =>
							handleBalanceLineChange(player.player_id, marketType, 'up')
						}
					>
						▲
					</div>
					<div className='balance-line'>{currentBalanceLine ?? 'N/A'}</div>
					<div
						className='arrow-down'
						onClick={() =>
							handleBalanceLineChange(player.player_id, marketType, 'down')
						}
					>
						▼
					</div>
				</div>
				<div className='odds-values-prefix'>
					<div>O|</div>
					<div>U|</div>
				</div>
				<div className='odds-values'>
					<div className='over-odds'>
						{marketData[currentBalanceLine]?.balance_line_over_odds ?? 'N/A'}
					</div>
					<div className='under-odds'>
						{marketData[currentBalanceLine]?.balance_line_under_odds ?? 'N/A'}
					</div>
				</div>
			</div>
		</td>
	);
};

export default TableCell;
