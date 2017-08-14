"use strict";

const Y = 0;
const W = 1;
const STRICT = 2;
const STACKED = 3;

const BELOW = 1;
const ABOVE = 2;

function stemPositionToActions(y, w, stems) {
	const uppx = this.uppx;
	let actions = [];
	let stackrel = []
	for (let j = 0; j < stems.length; j++) {
		actions[j] = [y[j], w[j], false, false];
		stackrel[j] = [];
	}

	// downward strictness/stackness detection
	for (let j = 0; j < stems.length; j++) {
		const sj = stems[j], yj = actions[j][Y], wj = actions[j][W];
		for (let k = 0; k < j; k++) {
			const sk = stems[k], yk = actions[k][Y], wk = actions[k][W];
			if (yj - wj === yk && wk * uppx * 2 >= sk.width
				&& sj.xmax >= sk.xmax - wk / 2 * uppx && sj.xmin <= sk.xmin + wk / 2 * uppx
				&& !(sj.xmax <= sk.xmax && sj.xmin >= sk.xmin)
				&& !(stems[j].rid === stems[k].rid && stems[j].rid)) {
				stackrel[k][j] = BELOW;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > sj.width) continue;
			if (yj - wj - yk === 1 && sj.posKeyAtTop
				|| yj - wj - yk <= 2.05 && sj.posKeyAtTop && !sk.posKeyAtTop
				&& wk * uppx < sk.width - 0.2 * uppx
				&& wj * uppx < sj.width - 0.2 * uppx) {
				actions[j][STRICT] = true;
			}
		}
	}
	for (let j = 0; j < stems.length; j++) {
		const sj = stems[j], yj = actions[j][Y], wj = actions[j][W];
		for (let k = j + 1; k < stems.length; k++) {
			const sk = stems[k], yk = actions[k][Y], wk = actions[k][W];
			if (yk - wk === yj && wk * uppx * 2 >= sk.width
				&& sj.xmax >= sk.xmax - wk / 2 * uppx && sj.xmin <= sk.xmin + wk / 2 * uppx
				&& !(sk.xmax >= sj.xmax && sk.xmin <= sj.xmin)
				&& !(stems[j].rid === stems[k].rid && stems[j].rid)) {
				stackrel[k][j] = ABOVE;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > sj.width) continue;
			if (yk - wk - yj === 1 && !sj.posKeyAtTop) {
				actions[j][STRICT] = true;
			}
		}
	}
	for (let j = 0; j < stems.length; j++) for (let k = 0; k < j; k++) {
		for (let m = 0; m < stems.length; m++) {
			if (stackrel[j][m] && stackrel[j][m] === stackrel[k][m] && this.directOverlaps[j][k]) {
				actions[k][W] = 0;
			}
		}
	}
	return actions;
}
module.exports = stemPositionToActions;
