"use strict";

const roundings = require("../support/roundings");
const { decideDeltaShift, getSWCFG } = require("../instructor/delta");

const Y = 0;
const W = 1;
const HARD = 2;
const STACKED = 3;
const ADDPXS = 4;
const FLIP = 5;

const BELOW = 1;
const ABOVE = 2;
function widthOf(s) {
	return s.posKeyAtTop
		? s.posKey.y - s.advKey.y + (s.advKey.x - s.posKey.x) * s.slope
		: s.advKey.y - s.posKey.y + (s.posKey.x - s.advKey.x) * s.slope;
}
function twoPixelPack(uppx, uj, uk, yj, wj, yk, wk, sj, sk) {
	return (
		uj &&
		!uk &&
		(yj - wj - yk <= 2.05 && wk * uppx + wj * uppx < widthOf(sk) + widthOf(sj) - 0.25 * uppx)
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

function padSD(actions, stems, overlaps, upm, ppem, tb, swcfg) {
	const uppx = upm / ppem;
	const [bottom, top] = tb;
	let hsw = [];
	for (let j = 0; j < stems.length; j++) {
		hsw[j] = actions[j][W];
	}
	for (let round = 0; round < 4; round++) {
		let stackrel = [];
		let up = [],
			y = [],
			w = [];
		for (let j = 0; j < stems.length; j++) {
			actions[j][HARD] = false;
			actions[j][STACKED] = false;
			actions[j][ADDPXS] = 0;
			stackrel[j] = [];

			const sj = stems[j];
			const high = sj.posKeyAtTop ? sj.posKey : sj.advKey;
			const low = sj.posKeyAtTop ? sj.advKey : sj.posKey;
			y[j] = Math.round(actions[j][Y] - (actions[j][FLIP] || 0));
			w[j] = Math.round(actions[j][W]);

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
			if ((!sj.hasGlyphStemAbove && !sj.diagLow) || (!sj.hasGlyphStemBelow && !sj.diagHigh)) {
				up[j] = sj.posKeyAtTop;
			} else {
				up[j] = hintedThinner === midlineLower;
			}
		}
		for (let j = 0; j < stems.length; j++) {
			const sj = stems[j];
			w[j] = Math.min(w[j], y[j] - bottom);
			if (up[j] && widthOf(sj) / uppx > w[j] && y[j] - w[j] <= bottom) {
				actions[j][HARD] = true;
			}
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
					wk * uppx * 2 >= widthOf(sk) &&
					sjmax >= skmax - wk / 2 * uppx &&
					sjmin <= skmin + wk / 2 * uppx &&
					!(sjmax < skmax && sjmin > skmin) &&
					!(sj.rid === sk.rid && sj.rid) &&
					(sk.hasGlyphStemBelow && sk.hasGlyphStemAbove)
				) {
					stackrel[j][k] = ABOVE;
					stackrel[k][j] = BELOW;
					actions[k][STACKED] = true;
				}
				if (wj * uppx > widthOf(sj)) continue;
				if (
					(yj - wj - yk === 1 && up[j] && (!coK || (coK && y[coKID] === yk))) ||
					(twoPixelPack(uppx, up[j], up[k], yj, wj, yk, wk, sj, sk) &&
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
					wk * uppx * 2 >= widthOf(sk) &&
					sjmax >= skmax - wk / 2 * uppx &&
					sjmin <= skmin + wk / 2 * uppx &&
					!(skmax > sjmax && skmin < sjmin) &&
					!(sj.rid === sk.rid && sj.rid) &&
					(sk.hasGlyphStemBelow && sk.hasGlyphStemAbove)
				) {
					stackrel[j][k] = BELOW;
					stackrel[k][j] = ABOVE;
					actions[k][STACKED] = true;
				}
				if (wj * uppx > widthOf(sj)) continue;
				if (
					(yk - wk - yj === 1 && !up[j] && (!coK || (coK && y[coKID] === yk))) ||
					(twoPixelPack(uppx, up[k], up[j], yk, wk, yj, wj, sk, sj) &&
						sjmax - sjmin <= skmax - skmin)
				) {
					actions[j][HARD] = true;
				}
			}
		}
		// fold strokes
		for (let j = 0; j < stems.length; j++) {
			const sj = stems[j];
			if (
				!sj.hasGlyphStemBelow &&
				(sj.hasGlyphFoldBelow || sj.hasGlyphSideFoldBelow) &&
				up[j] &&
				y[j] <= bottom + Math.max(4, w[j] * 3)
			) {
				if (w[j] * uppx < Math.abs(sj.posKey.y - sj.advKey.y)) {
					actions[j][HARD] = true;
				} else if (w[j] > 1) {
					actions[j][STACKED] = true;
				}
			}
		}

		hsw = [];
		for (let j = 0; j < stems.length; j++) {
			actions[j][Y] = y[j];
			actions[j][W] = w[j];
			actions[j][FLIP] = 0;

			const stemWidth = Math.abs(stems[j].posKey.y - stems[j].advKey.y);
			const [, , hard, stacked] = actions[j];

			const delta = decideDeltaShift(
				8,
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
			const hintedStemWidthPixels = (hsw[j] =
				Math.round(8 * (stemWidth / uppx + delta / 8)) / 8);
			const belowOnePixel = w[j] === 1 && hintedStemWidthPixels <= 1;
			const wdiff = hintedStemWidthPixels - actions[j][W];
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
