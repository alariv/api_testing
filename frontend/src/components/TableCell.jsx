import React, { useMemo } from 'react';

const TableCell = ({
	player,
	marketType,
	getCurrentBalanceLine,
	handleBalanceLineChange,
	isBlinking = false,
	isMilestone = false
}) => {
	const marketData = player.markets?.[marketType];

	// Memoize expensive calculations
	const { availableBalanceLines, defaultLine } = useMemo(() => {
		if (!marketData) return { availableBalanceLines: [], defaultLine: null };
		const lines = Object.keys(marketData)
			.map(Number)
			.filter((n) => !isNaN(n))
			.sort((a, b) => a - b);

		if (lines.length === 0)
			return { availableBalanceLines: [], defaultLine: null };

		// Find the default line - for milestones use milestone_line, for balance lines use is_balanced
		let defaultLine = lines[0]; // fallback to smallest

		if (isMilestone) {
			// For milestones, look for the milestone_line value
			for (const line of lines) {
				if (marketData[line]?.milestone_line !== undefined) {
					defaultLine = line;
					break;
				}
			}
		} else {
			// For balance lines, look for is_balanced: true
			for (const balanceLine of lines) {
				if (marketData[balanceLine]?.is_balanced === true) {
					defaultLine = balanceLine;
					break;
				}
			}
		}

		return { availableBalanceLines: lines, defaultLine };
	}, [marketData, isMilestone]);

	if (!marketData || availableBalanceLines.length === 0) return <td>N/A</td>;

	const currentLine = getCurrentBalanceLine(
		player.player_id,
		marketType,
		defaultLine
	);

	// Create a unique key that changes when the line changes
	const cellKey = `${player.player_id}-${marketType}-${currentLine}`;

	return (
		<td key={cellKey} className={`market-${marketType}`}>
			<div
				className={`odds-widget market-${marketType} ${
					!isMilestone && marketData[currentLine]?.is_balanced ? 'balanced' : ''
				} ${marketData[currentLine]?.is_suspended ? 'suspended' : ''} ${
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
					<div className={isMilestone ? 'milestone-line' : 'balance-line'}>
						{isMilestone
							? marketData[currentLine]?.milestone_line ?? 'N/A'
							: currentLine ?? 'N/A'}
					</div>
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
						{isMilestone
							? marketData[currentLine]?.milestone_over_odds ?? 'N/A'
							: marketData[currentLine]?.balance_line_over_odds ?? 'N/A'}
					</div>
					<div className='under-odds'>
						{isMilestone
							? marketData[currentLine]?.milestone_under_odds ?? 'N/A'
							: marketData[currentLine]?.balance_line_under_odds ?? 'N/A'}
					</div>
				</div>
				<div className='settlements'>
					<div
						className={`settlement-circle ${
							marketData[currentLine]?.balance_line_over_settlement === 'W'
								? 'win'
								: marketData[currentLine]?.balance_line_over_settlement === 'L'
								? 'loss'
								: 'neutral'
						}`}
						title={`Over settlement: ${
							marketData[currentLine]?.balance_line_over_settlement || 'N/A'
						}`}
					>
						{marketData[currentLine]?.balance_line_over_settlement ?? ''}
					</div>
					<div className='settlement-value'>
						{marketData[currentLine]?.settlement_value ?? ''}
					</div>
					<div
						className={`settlement-circle ${
							marketData[currentLine]?.balance_line_under_settlement === 'W'
								? 'win'
								: marketData[currentLine]?.balance_line_under_settlement === 'L'
								? 'loss'
								: 'neutral'
						}`}
						title={`Under settlement: ${
							marketData[currentLine]?.balance_line_under_settlement || 'N/A'
						}`}
					>
						{marketData[currentLine]?.balance_line_under_settlement ?? ''}
					</div>
				</div>
			</div>
		</td>
	);
};

export default TableCell;
