"use strict";

const { xclamp } = require("../../../support/common");

function canBeAdjustedUp(y, k, env, distance) {
	for (var j = k + 1; j < y.length; j++) {
		if (env.directOverlaps[j][k] && y[j] - y[k] - 1 <= distance) return false;
	}
	return true;
}
function canBeAdjustedDown(y, k, env, distance) {
	for (var j = 0; j < k; j++) {
		if (env.directOverlaps[k][j] && y[k] - y[j] - 1 <= distance) return false;
	}
	return true;
}
function spaceBelow1(env, y, k, bottom) {
	var space = y[k] - env.avails[k].properWidth - bottom;
	for (var j = k - 1; j >= 0; j--) {
		if (env.directOverlaps[k][j] && y[k] - y[j] - env.avails[k].properWidth < space)
			space = y[k] - y[j] - env.avails[k].properWidth;
	}
	return space;
}
function spaceAbove1(env, y, k, top) {
	var space = top - y[k];
	for (var j = k + 1; j < y.length; j++) {
		if (env.directOverlaps[j][k] && y[j] - y[k] - env.avails[j].properWidth < space)
			space = y[j] - y[k] - env.avails[j].properWidth;
	}
	return space;
}

function colliding(y, p, q) {
	return y[p] - y[q] < 2 && y[p] - y[q] >= 1;
}
function aligned(y, p, q) {
	return y[p] - y[q] < 1;
}
function spare(y, p, q) {
	return y[p] - y[q] > 1;
}
function veryspare(y, p, q) {
	return y[p] - y[q] > 2;
}
function desc0(a, b) {
	return b[0] - a[0];
}
function getm(avails) {
	let m = [];
	for (let j = 0; j < avails.length; j++) {
		m.push([avails[j].length, j]);
	}
	return m.sort(desc0);
}
function balance(y, env) {
	y = y.slice(0);
	var REBALANCE_PASSES = env.strategy.REBALANCE_PASSES;
	var pixelTopPixels = Math.round(env.glyphTop / env.uppx);
	var pixelBottomPixels = Math.round(env.glyphBottom / env.uppx);

	var N = y.length;
	var avails = env.avails,
		triplets = env.triplets,
		directOverlaps = env.directOverlaps;
	var m = getm(avails);
	for (var pass = 0; pass < REBALANCE_PASSES; pass++) {
		let stable = true;
		for (var jm = 0; jm < N; jm++) {
			var j = m[jm][1];
			if (avails[j].atGlyphBottom || avails[j].atGlyphTop) continue;
			if (canBeAdjustedDown(y, j, env, 1.8) && y[j] > avails[j].low) {
				if (y[j] - avails[j].center > 0.6) {
					y[j] -= 1;
					stable = false;
				}
			} else if (canBeAdjustedUp(y, j, env, 1.8) && y[j] < avails[j].high) {
				if (avails[j].center - y[j] > 0.6) {
					y[j] += 1;
					stable = false;
				}
			}
		}
		if (stable) break;
	}

	for (var pass = 0; pass < REBALANCE_PASSES; pass++) {
		let stable = true;
		for (var _t = 0; _t < triplets.length; _t++) {
			const t = triplets[_t];
			const j = t[0],
				k = t[1],
				m = t[2];
			if (colliding(y, j, k) && spare(y, k, m) && y[k] > avails[k].low) {
				var newcol = 0;
				for (var s = 0; s < y.length; s++)
					if (directOverlaps[k][s] && spare(y, k, s)) newcol += env.C[k][s];
				if (env.C[j][k] > newcol) {
					y[k] -= 1;
					stable = false;
				}
			} else if (colliding(y, k, m) && spare(y, j, k) && y[k] < avails[k].high) {
				var newcol = 0;
				for (var s = 0; s < y.length; s++) {
					if (directOverlaps[s][k] && spare(y, s, k)) {
						newcol += env.C[s][k];
					}
				}
				if (newcol < env.C[k][m]) {
					y[k] += 1;
					stable = false;
				}
			} else if (colliding(y, j, k) && colliding(y, k, m)) {
				if (env.A[j][k] <= env.A[k][m] && y[k] < avails[k].high) {
					y[k] += 1;
					stable = false;
				} else if (env.A[j][k] >= env.A[k][m] && y[k] > avails[k].low) {
					y[k] -= 1;
					stable = false;
				} else if (y[k] < avails[k].high) {
					y[k] += 1;
					stable = false;
				} else if (y[k] > avails[k].low) {
					y[k] -= 1;
					stable = false;
				}
			}
		}
		if (stable) break;
	}

	for (var pass = 0; pass < REBALANCE_PASSES; pass++) {
		let stable = true;
		for (var _t = 0; _t < triplets.length; _t++) {
			const t = triplets[_t];
			const j = t[0],
				k = t[1],
				m = t[2];
			var su = spaceAbove1(env, y, k, pixelTopPixels + 3);
			var sb = spaceBelow1(env, y, k, pixelBottomPixels - 3);
			var d1 = y[j] - avails[j].properWidth - y[k];
			var d2 = y[k] - avails[k].properWidth - y[m];
			var o1 = avails[j].y0 - avails[j].w0 - avails[k].y0;
			var o2 = avails[k].y0 - avails[k].w0 - avails[m].y0;
			if (
				y[k] < avails[k].high &&
				o1 / o2 < 2 &&
				env.P[j][k] <= env.P[k][m] &&
				su > 1 &&
				(sb < 1 || d1 >= d2 * 2)
			) {
				y[k] += 1;
				stable = false;
			} else if (
				y[k] > avails[k].low &&
				o2 / o1 < 2 &&
				env.P[j][k] >= env.P[k][m] &&
				sb > 1 &&
				(su < 1 || d2 >= d1 * 2)
			) {
				y[k] -= 1;
				stable = false;
			}
		}
		if (stable) break;
	}

	for (var j = 0; j < N; j++) {
		for (var k = 0; k < j; k++) {
			if (env.symmetry[j][k] && y[j] !== y[k]) {
				y[k] = y[j];
			}
		}
	}
	return y;
}

module.exports = balance;
