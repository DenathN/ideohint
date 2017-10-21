"use strict";

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
function padSD(actions, stems, directOverlaps, uppx) {
	let stackrel = [];
	for (let j = 0; j < stems.length; j++) {
		actions[j][HARD] = false;
		actions[j][STACKED] = false;
		actions[j][ADDPXS] = 0;
		stackrel[j] = [];
	}
	// downward strictness/stackness detection
	for (let j = 0; j < stems.length; j++) {
		const sj = stems[j],
			yj = actions[j][Y],
			wj = actions[j][W];
		for (let k = 0; k < j; k++) {
			const sk = stems[k],
				yk = actions[k][Y],
				wk = actions[k][W];
			if (
				yj - wj === yk &&
				wk * uppx * 2 >= widthOf(sk) &&
				sj.xmax >= sk.xmax - wk / 2 * uppx &&
				sj.xmin <= sk.xmin + wk / 2 * uppx &&
				!(sj.xmax <= sk.xmax && sj.xmin >= sk.xmin) &&
				!(sj.rid === sk.rid && sj.rid)
			) {
				stackrel[k][j] = BELOW;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > widthOf(sj)) continue;
			if (
				(yj - wj - yk === 1 && sj.posKeyAtTop) ||
				(twoPixelPack(uppx, yj, wj, yk, wk, sj, sk) &&
					sj.xmax - sj.xmin < sk.xmax - sk.xmin)
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
			const sk = stems[k],
				yk = actions[k][Y],
				wk = actions[k][W];
			if (
				yk - wk === yj &&
				wk * uppx * 2 >= widthOf(sk) &&
				sj.xmax >= sk.xmax - wk / 2 * uppx &&
				sj.xmin <= sk.xmin + wk / 2 * uppx &&
				!(sk.xmax >= sj.xmax && sk.xmin <= sj.xmin) &&
				!(sj.rid === sk.rid && sj.rid)
			) {
				stackrel[k][j] = ABOVE;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > widthOf(sj)) continue;
			if (
				(yk - wk - yj === 1 && !sj.posKeyAtTop) ||
				(twoPixelPack(uppx, yk, wk, yj, wj, sk, sj) &&
					sj.xmax - sj.xmin <= sk.xmax - sk.xmin)
			) {
				actions[j][HARD] = true;
			}
		}
	}
	for (let j = 0; j < stems.length; j++) {
		const sj = stems[j];
		if (
			!sj.hasGlyphStemBelow &&
			(sj.hasGlyphFoldBelow || sj.hasGlyphSideFoldBelow) &&
			sj.posKeyAtTop
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
		padSD(sd[ppem].y, si.stems, si.directOverlaps, si.upm / ppem);
	}
};
