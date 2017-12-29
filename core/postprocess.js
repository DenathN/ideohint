"use strict";

const roundings = require("../support/roundings");
const { decideDeltaShift, getSWCFG } = require("../instructor/delta");

const GEAR = 8;

const Y = 0;
const W = 1;
const HARD = 2;
const STACKED = 3;
const ADDPXS = 4;
const FLIP = 5;

function twoPixelPack(uppx, uj, uk, yj, wj, yk, wk, hwj, hwk) {
	return (
		uj && !uk && (yj - wj - yk <= 2.05 && hwj > wj && hwk > wk && hwj + hwk - wj - wk > 3 / 8)
	);
}

function getMinmax(stems, k, y, w, sign) {
	const sk = stems[k];
	let couple = null;
	let coKID = 0;
	if (sk.rid) {
		for (let m = 0; m < stems.length; m++)
			if (m !== k && stems[m].rid === sk.rid && y[k] - w[k] * sign === y[m] - w[m] * sign) {
				couple = stems[m];
				coKID = m;
			}
	}
	if (couple) {
		return [Math.min(sk.xmin, couple.xmin), Math.max(sk.xmax, couple.xmax), couple, coKID];
	} else {
		return [sk.xmin, sk.xmax, couple, 0];
	}
}

function stemOverlaps(ov, j, k, sj, sk) {
	if (ov) {
		return ov[j][k] || ov[k][j];
	} else {
		return !(sj.xmax <= sk.xmin || sk.xmax <= sj.xmin);
	}
}

function tbtfm(y, [bottom, top, bottom0, top0]) {
	return (y - bottom0) / (top0 - bottom0) * (top - bottom) + bottom;
}

// The size-dependent flipping is decided in this strategy:
//   1. Make the hinted stroke closest to the unhinted, while preseving
//      the integral position and width constraints;
//   2. Avoid HARD strokes as more as possible.
// Therefore we use a three-step strategy to decide the UP[] array:
//   1. Run three PP rounds with up[] decided by promixity;
//   2. Flip the up[] items for harden strokes; Run three PP rounds;
//   3. Revert strokes being worsen by the flipping, and run the last three PP rounds.
function padSD(actions, stems, overlaps, upm, ppem, tb, swcfg) {
	const uppx = upm / ppem;
	const [bottom, top] = tb;

	// this array records the stroke width of each stem,
	// with the "true" width decided by the delta hinter.
	// Initially it is set to the integral width and updated
	// in each ppRound. That's why we need three rounds for each sub pass.
	let hsw = [];
	let hswNoHard = [];
	let lock = [];
	for (let j = 0; j < stems.length; j++) {
		hswNoHard[j] = actions[j][W];
		hsw[j] = actions[j][W];
		lock[j] = false;
	}

	function lockUp(sj) {
		return (
			((!sj.hasGlyphStemAbove && !sj.diagLow) || (!sj.hasGlyphStemBelow && !sj.diagHigh)) &&
			Math.abs(sj.posKey.y - sj.advKey.y) <= 1.75 * uppx
		);
	}
	function decideHardAndStack(up, y, w) {
		for (let j = 0; j < stems.length; j++) {
			actions[j][HARD] = false;
			actions[j][STACKED] = false;
			actions[j][ADDPXS] = 0;
		}

		// downward strictness/stackness detection
		for (let j = 0; j < stems.length; j++) {
			const sj = stems[j],
				yj = y[j],
				wj = w[j];
			for (let k = 0; k < j; k++) {
				const sk = stems[k],
					yk = y[k],
					wk = w[k];
				if (!stemOverlaps(overlaps, j, k, sk, sk)) continue;

				const [skmin, skmax, coK, coKID] = getMinmax(stems, k, y, w, 0);
				const [sjmin, sjmax] = getMinmax(stems, j, y, w, 1);
				if (
					yj - wj === yk &&
					wk * 2 >= hswNoHard[k] &&
					sjmax >= skmax - wk / 2 * uppx &&
					sjmin <= skmin + wk / 2 * uppx &&
					!(sjmax < skmax && sjmin > skmin) &&
					!(sj.rid === sk.rid && sj.rid) &&
					(sk.hasGlyphStemBelow && sk.hasGlyphStemAbove)
				) {
					actions[k][STACKED] = true;
				}
				if (wj >= hswNoHard[j]) continue;
				if (
					(yj - wj - yk === 1 && up[j] && (!coK || (coK && y[coKID] === yk))) ||
					(twoPixelPack(uppx, up[j], up[k], yj, wj, yk, wk, hswNoHard[j], hswNoHard[k]) &&
						sjmax - sjmin < skmax - skmin)
				) {
					actions[j][HARD] = true;
				}
			}
		}
		for (let j = 0; j < stems.length; j++) {
			const sj = stems[j],
				yj = y[j],
				wj = w[j];
			for (let k = j + 1; k < stems.length; k++) {
				const sk = stems[k],
					yk = y[k],
					wk = w[k];

				if (!stemOverlaps(overlaps, j, k, sk, sk)) continue;

				const [skmin, skmax, coK, coKID] = getMinmax(stems, k, y, w, 1);
				const [sjmin, sjmax] = getMinmax(stems, j, y, w, 0);
				if (
					yk - wk === yj &&
					wk * 2 >= hswNoHard[k] &&
					sjmax >= skmax - wk / 2 * uppx &&
					sjmin <= skmin + wk / 2 * uppx &&
					!(skmax > sjmax && skmin < sjmin) &&
					!(sj.rid === sk.rid && sj.rid) &&
					(sk.hasGlyphStemBelow && sk.hasGlyphStemAbove)
				) {
					actions[k][STACKED] = true;
				}
				if (wj >= hswNoHard[j]) continue;
				if (
					(yk - wk - yj === 1 && !up[j] && (!coK || (coK && y[coKID] === yk))) ||
					(twoPixelPack(uppx, up[k], up[j], yk, wk, yj, wj, hswNoHard[k], hswNoHard[j]) &&
						sjmax - sjmin <= skmax - skmin)
				) {
					actions[j][HARD] = true;
				}
			}
		}
	}
	function updateActions(up, y, w) {
		for (let j = 0; j < stems.length; j++) {
			let [, , hard, stacked] = actions[j];
			actions[j][Y] = y[j];
			actions[j][W] = w[j];
			actions[j][FLIP] = 0;

			const stemWidth = Math.abs(stems[j].posKey.y - stems[j].advKey.y);
			const delta = decideDeltaShift(
				GEAR,
				1,
				hard,
				stacked,
				0,
				stemWidth,
				0,
				actions[j][W] * uppx,
				upm,
				ppem,
				swcfg
			);
			const hintedStemWidthPixels = Math.round(8 * (stemWidth / uppx + delta / 8)) / 8;
			hsw[j] = hintedStemWidthPixels;

			const deltaSoft = decideDeltaShift(
				GEAR,
				1,
				false,
				false,
				0,
				stemWidth,
				0,
				actions[j][W] * uppx,
				upm,
				ppem,
				swcfg
			);
			hswNoHard[j] = Math.round(8 * (stemWidth / uppx + deltaSoft / 8)) / 8;

			const belowOnePixel = w[j] === 1 && hintedStemWidthPixels <= 1;

			if (up[j] && actions[j][Y] - hintedStemWidthPixels < bottom) {
				hard = true;
			}
			if (!up[j] && actions[j][Y] - actions[j][W] + hintedStemWidthPixels > top) {
				hard = true;
			}
			actions[j][HARD] = hard;

			const wdiff = hard ? 0 : hintedStemWidthPixels - actions[j][W];
			if (!hard && !belowOnePixel && up[j] && !stems[j].posKeyAtTop) {
				actions[j][Y] -= wdiff;
				actions[j][FLIP] -= wdiff;
			} else if (!hard && !belowOnePixel && !up[j] && stems[j].posKeyAtTop) {
				actions[j][Y] += wdiff;
				actions[j][FLIP] += wdiff;
			}
			if (actions[j][Y] > top) {
				const overflow = top - actions[j][Y];
				actions[j][Y] -= overflow;
				actions[j][FLIP] -= overflow;
			}
		}
	}
	function initUpArray(y, w, hsw) {
		let up = [];
		for (let j = 0; j < stems.length; j++) {
			const sj = stems[j];
			const high = sj.posKeyAtTop ? sj.posKey : sj.advKey;
			const low = sj.posKeyAtTop ? sj.advKey : sj.posKey;

			// The up[j] determines whether stem[j]'s hard edge should be the top edge
			// under this pixel size. It is determined by either:
			//  - Whether the (integral) hinted position is lower than the original position
			//  - Whether the fractional hinted stem width is wider than the original width
			// The <LOW-THINNER> and <HIGH-WIDTH> combination would lead up[j] to true
			// ps. topmost and bottommost stems are not altered
			const estimatedHigh = tbtfm(high.y, tb); // Estimated unrounded top-edge position
			const estimatedLow = tbtfm(low.y, tb); // Estimated unrounded bottom-edge position
			const midlineLower = y[j] - w[j] / 2 <= (estimatedHigh + estimatedLow) / 2;
			const hintedThinner = hsw[j] <= w[j];
			if (lockUp(sj)) {
				up[j] = sj.posKeyAtTop;
			} else {
				up[j] =
					Math.abs(hsw[j] - w[j]) < 1 / GEAR
						? sj.posKeyAtTop
						: hintedThinner === midlineLower;
			}
		}
		return up;
	}
	function ppRound(up) {
		let y = [],
			w = [];
		for (let j = 0; j < stems.length; j++) {
			y[j] = Math.round(actions[j][Y] - (actions[j][FLIP] || 0));
			w[j] = Math.round(actions[j][W]);
		}
		if (!up) {
			up = initUpArray(y, w, hsw);
		}
		decideHardAndStack(up, y, w);
		updateActions(up, y, w);
		return up;
	}

	// Pass 1: Decide by promixity
	ppRound();
	ppRound();
	const up = ppRound();

	// Pass 2: try to flip strokes that are harden
	const up1 = [...up];
	const hard1 = [];
	for (let j = 0; j < stems.length; j++) {
		hard1[j] = actions[j][HARD];
		if (hard1[j] && actions[j][W] === 1 && !lockUp(stems[j])) {
			up1[j] = !up1[j];
		}
	}

	const up2 = ppRound([...up1]);

	// Pass 3: find improvements
	for (let j = 0; j < stems.length; j++) {
		if (!actions[j][HARD] && hard1[j]) {
			("Stroke [j] really de-harden due to flipping up[j].");
			("Keep this improvement.");
		} else {
			("Revert to the initial up term.");
			up2[j] = up[j];
		}
	}

	ppRound([...up2]);

	return actions;
}
function calculateTB(si, ppem) {
	const uppx = si.upm / ppem;
	const rtg = roundings.Rtg(si.upm, ppem);
	const rBottomPos = rtg(si.blue.bottomPos) / uppx;
	const rTopPos = (rtg(si.blue.bottomPos) + rtg(si.blue.topPos - si.blue.bottomPos)) / uppx;
	return [rBottomPos, rTopPos, si.blue.bottomPos, si.blue.topPos];
}

function swcfcCtxFor(strategy) {
	if (strategy) {
		return {
			minSW: strategy.MINIMAL_STROKE_WIDTH_PIXELS || 1 / 8,
			maxSWOverflowCpxs: strategy.MAX_SW_OVERFLOW_CPXS,
			maxSWShrinkCpxs: strategy.MAX_SW_SHRINK_CPXS
		};
	} else {
		return { minSW: 1 / 8, maxSWOverflowCpxs: 1 / 2, maxSWShrinkCpxs: 1 / 2 };
	}
}

module.exports = function(data, strategy) {
	if (!data) return;
	const { si, sd, pmin, pmax } = data;
	for (let ppem = pmin; ppem <= pmax; ppem++) {
		if (!sd[ppem]) continue;

		padSD(
			sd[ppem].y,
			si.stems,
			si.overlaps,
			si.upm,
			ppem,
			calculateTB(si, ppem),
			getSWCFG(swcfcCtxFor(strategy), 1, ppem)
		);
	}
};
module.exports.for = padSD;
module.exports.getSwcfgFor = function(strategy, ppem) {
	return getSWCFG(swcfcCtxFor(strategy), 1, ppem);
};
