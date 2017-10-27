"use strict";

const roundings = require("../support/roundings");

const Y = 0;
const W = 1;
const HARD = 2;
const STACKED = 3;
const ADDPXS = 4;

const BELOW = 1;
const ABOVE = 2;
function widthOf(s) {
	return s.posKeyAtTop
		? s.posKey.y - s.advKey.y + (s.advKey.x - s.posKey.x) * s.slope
		: s.advKey.y - s.posKey.y + (s.posKey.x - s.advKey.x) * s.slope;
}
function twoPixelPack(uppx, yj, wj, yk, wk, sj, sk) {
	return (
		sj.posKeyAtTop &&
		!sk.posKeyAtTop &&
		((yj - wj - yk <= 2.05 &&
			wk * uppx + wj * uppx < widthOf(sk) + widthOf(sj) - 0.25 * uppx) ||
			(yj - wj - yk <= 3.05 &&
				wk * uppx + wj * uppx < widthOf(sk) + widthOf(sj) - 0.5 * uppx))
	);
}

function getMinmax(stems, k, a, sign) {
	const sk = stems[k];
	let couple = null;
	let coKID = 0;
	if (sk.rid) {
		for (let m = 0; m < stems.length; m++)
			if (
				m !== k &&
				stems[m].rid === sk.rid &&
				a[k][Y] - a[k][W] * sign === a[m][Y] - a[m][W] * sign
			) {
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
function padSD(actions, stems, directOverlaps, uppx, bottom) {
	let stackrel = [];
	for (let j = 0; j < stems.length; j++) {
		actions[j][HARD] = false;
		actions[j][STACKED] = false;
		actions[j][ADDPXS] = 0;
		stackrel[j] = [];
	}
	for (let j = 0; j < stems.length; j++) {
		actions[j][W] = Math.min(actions[j][W], actions[j][Y] - bottom);
	}
	// downward strictness/stackness detection
	for (let j = 0; j < stems.length; j++) {
		const sj = stems[j],
			yj = actions[j][Y],
			wj = actions[j][W];
		for (let k = 0; k < j; k++) {
			if (!(directOverlaps[j][k] || directOverlaps[k][j])) continue;

			const sk = stems[k],
				yk = actions[k][Y],
				wk = actions[k][W];
			const [skmin, skmax, coK, coKID] = getMinmax(stems, k, actions, 0);
			const [sjmin, sjmax] = getMinmax(stems, j, actions, 1);
			if (
				yj - wj === yk &&
				wk * uppx * 2 >= widthOf(sk) &&
				sjmax >= skmax - wk / 2 * uppx &&
				sjmin <= skmin + wk / 2 * uppx &&
				!(sjmax <= skmax && sjmin >= skmin) &&
				!(sj.rid === sk.rid && sj.rid)
			) {
				stackrel[k][j] = BELOW;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > widthOf(sj)) continue;
			if (!(directOverlaps[j][k] || directOverlaps[k][j])) continue;
			if (
				(yj - wj - yk === 1 &&
					sj.posKeyAtTop &&
					(!coK || (coK && actions[coKID][Y] === yk))) ||
				(twoPixelPack(uppx, yj, wj, yk, wk, sj, sk) && sjmax - sjmin < skmax - skmin)
			) {
				actions[j][HARD] = true;
			}
		}
	}
	for (let j = 0; j < stems.length; j++) {
		const sj = stems[j],
			yj = actions[j][Y],
			wj = actions[j][W];
		for (let k = j + 1; k < stems.length; k++) {
			if (!(directOverlaps[j][k] || directOverlaps[k][j])) continue;

			const sk = stems[k],
				yk = actions[k][Y],
				wk = actions[k][W];

			const [skmin, skmax, coK, coKID] = getMinmax(stems, k, actions, 1);
			const [sjmin, sjmax] = getMinmax(stems, j, actions, 0);
			if (
				yk - wk === yj &&
				wk * uppx * 2 >= widthOf(sk) &&
				sjmax >= skmax - wk / 2 * uppx &&
				sjmin <= skmin + wk / 2 * uppx &&
				!(skmax >= sjmax && skmin <= sjmin) &&
				!(sj.rid === sk.rid && sj.rid)
			) {
				stackrel[k][j] = ABOVE;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > widthOf(sj)) continue;
			if (
				(yk - wk - yj === 1 &&
					!sj.posKeyAtTop &&
					(!coK || (coK && actions[coKID][Y] === yk))) ||
				(twoPixelPack(uppx, yk, wk, yj, wj, sk, sj) && sjmax - sjmin <= skmax - skmin)
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
			sj.posKeyAtTop &&
			actions[j][Y] <= bottom + Math.max(4, actions[j][W] * 3)
		) {
			if (actions[j][W] * uppx < Math.abs(sj.posKey.y - sj.advKey.y)) {
				actions[j][HARD] = true;
			} else if (actions[j][W] > 1) {
				actions[j][STACKED] = true;
			}
		}
	}
	for (let j = 0; j < stems.length; j++)
		for (let k = 0; k < j; k++) {
			for (let m = 0; m < stems.length; m++) {
				if (stackrel[j][m] && stackrel[j][m] === stackrel[k][m] && directOverlaps[j][k]) {
					actions[k][W] = 0;
				}
			}
		}
	return actions;
}

module.exports = function(data) {
	if (!data) return;
	const { si, sd, pmin, pmax } = data;
	for (let ppem = pmin; ppem <= pmax; ppem++) {
		if (!sd[ppem]) continue;
		padSD(
			sd[ppem].y,
			si.stems,
			si.directOverlaps,
			si.upm / ppem,
			Math.round(roundings.rtg(si.blue.bottomPos, si.upm, ppem) / (si.upm / ppem))
		);
	}
};
module.exports.for = padSD;
