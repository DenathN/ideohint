"use strict";
const { mix, lerp, xlerp, xclamp } = require("../../support/common");

const Y = 0;
const W = 1;
const STRICT = 2;
const STACKED = 3;
const ADDPXS = 4;

const BELOW = 1;
const ABOVE = 2;

function twoPixelPack(uppx, yj, wj, yk, wk, sj, sk) {
	return (
		sj.posKeyAtTop &&
		!sk.posKeyAtTop &&
		((yj - wj - yk <= 2.05 && wk * uppx + wj * uppx < sk.width + sj.width - 0.25 * uppx) ||
			(yj - wj - yk <= 3.05 && wk * uppx + wj * uppx < sk.width + sj.width - 0.5 * uppx))
	);
}

function stemPositionToActions(y, w, stems) {
	const uppx = this.uppx;
	let actions = [];
	let stackrel = [];
	for (let j = 0; j < stems.length; j++) {
		actions[j] = [y[j], w[j], false, false, 0];
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
				wk * uppx * 2 >= sk.width &&
				sj.xmax >= sk.xmax - wk / 2 * uppx &&
				sj.xmin <= sk.xmin + wk / 2 * uppx &&
				!(sj.xmax <= sk.xmax && sj.xmin >= sk.xmin) &&
				!(stems[j].rid === stems[k].rid && stems[j].rid)
			) {
				stackrel[k][j] = BELOW;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > sj.width) {
				if (
					yj - wj - yk === 1 &&
					wj > 1 &&
					wk > 1 &&
					wk * uppx > sk.width &&
					wj * uppx + wk * uppx >= sj.width + sk.width + uppx * 0.75 &&
					(this.atGlyphTop(sj) || this.atGlyphBottom(sk)) &&
					sj.posKeyAtTop &&
					!sk.posKeyAtTop
				) {
					actions[j][ADDPXS] = (wj * uppx - sj.width) / (2 * uppx);
				}
			} else {
				if (
					(yj - wj - yk === 1 && sj.posKeyAtTop) ||
					(twoPixelPack(uppx, yj, wj, yk, wk, sj, sk) &&
						sj.xmax - sj.xmin < sk.xmax - sk.xmin)
				) {
					actions[j][STRICT] = true;
				}
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
				wk * uppx * 2 >= sk.width &&
				sj.xmax >= sk.xmax - wk / 2 * uppx &&
				sj.xmin <= sk.xmin + wk / 2 * uppx &&
				!(sk.xmax >= sj.xmax && sk.xmin <= sj.xmin) &&
				!(stems[j].rid === stems[k].rid && stems[j].rid)
			) {
				stackrel[k][j] = ABOVE;
				actions[k][STACKED] = true;
			}
			if (wj * uppx > sj.width) {
				// large-blank correction
				// For |->| |<-| situation, if both rounding are expansive and the impact is above 0.75px
				// add additional pixel correction into it.
				if (
					yk - wk - yj === 1 &&
					wj > 1 &&
					wk > 1 &&
					wk * uppx > sk.width &&
					wj * uppx + wk * uppx >= sj.width + sk.width + uppx * 0.75 &&
					(this.atGlyphBottom(sj) || this.atGlyphTop(sk)) &&
					!sj.posKeyAtTop &&
					sk.posKeyAtTop
				) {
					actions[j][ADDPXS] = (wj * uppx - sj.width) / (2 * uppx);
				}
			} else {
				if (
					(yk - wk - yj === 1 && !sj.posKeyAtTop) ||
					(twoPixelPack(uppx, yk, wk, yj, wj, sk, sj) &&
						sj.xmax - sj.xmin <= sk.xmax - sk.xmin)
				) {
					actions[j][STRICT] = true;
				}
			}
		}
	}
	for (let j = 0; j < stems.length; j++)
		for (let k = 0; k < j; k++) {
			for (let m = 0; m < stems.length; m++) {
				if (
					stackrel[j][m] &&
					stackrel[j][m] === stackrel[k][m] &&
					this.directOverlaps[j][k]
				) {
					actions[k][W] = 0;
				}
			}
		}
	return actions;
}
module.exports = stemPositionToActions;
