"use strict"

function xclamp(low, x, high) { return x < low ? low : x > high ? high : x }

function canBeAdjustedUp(y, k, env, distance) {
	for (var j = k + 1; j < y.length; j++) {
		if (env.directOverlaps[j][k] && (y[j] - y[k]) - 1 <= distance)
			return false
	}
	return true;
}
function canBeAdjustedDown(y, k, env, distance) {
	for (var j = 0; j < k; j++) {
		if (env.directOverlaps[k][j] && (y[k] - y[j]) - 1 <= distance)
			return false
	}
	return true;
}
function colliding(y, p, q) { return y[p] - y[q] < 2 && y[p] - y[q] >= 1; }
function aligned(y, p, q) { return y[p] - y[q] < 1; }
function spare(y, p, q) { return y[p] - y[q] > 1; }
function veryspare(y, p, q) { return y[p] - y[q] > 2; }
function balance(y, env) {
	var REBALANCE_PASSES = env.strategy.REBALANCE_PASSES;
	var N = y.length;
	var avaliables = env.avaliables, triplets = env.triplets, directOverlaps = env.directOverlaps;
	var m = avaliables.map(function (s, j) { return [s.length, j] }).sort(function (a, b) { return b[0] - a[0] });
	for (var pass = 0; pass < REBALANCE_PASSES; pass++) {
		for (var jm = 0; jm < N; jm++) {
			var j = m[jm][1];
			if (!avaliables[j].atGlyphBottom && !avaliables[j].atGlyphTop) {
				if (canBeAdjustedDown(y, j, env, 1.8) && y[j] > avaliables[j].low) {
					if (y[j] - avaliables[j].center > 0.6) {
						y[j] -= 1;
					}
				} else if (canBeAdjustedUp(y, j, env, 1.8) && y[j] < avaliables[j].high) {
					if (avaliables[j].center - y[j] > 0.6) {
						y[j] += 1;
					}
				}
			}
		}
	}
	for (var pass = 0; pass < REBALANCE_PASSES; pass++) {
		for (var t = 0; t < triplets.length; t++) {
			var j = triplets[t][0], k = triplets[t][1], m = triplets[t][2];
			if (colliding(y, j, k) && spare(y, k, m) && y[k] > avaliables[k].low) {
				var newcol = 0;
				for (var s = 0; s < y.length; s++) if (directOverlaps[k][s] && spare(y, k, s)) newcol += env.C[k][s];
				if (env.C[j][k] > newcol) {
					y[k] -= 1;
				}
			} else if (colliding(y, k, m) && spare(y, j, k) && y[k] < avaliables[k].high) {
				var newcol = 0;
				for (var s = 0; s < y.length; s++) if (directOverlaps[s][k] && spare(y, s, k)) newcol += env.C[s][k];
				if (newcol < env.C[k][m]) {
					y[k] += 1;
				}
			} else if (colliding(y, j, k) && colliding(y, k, m)) {
				if (env.A[j][k] <= env.A[k][m] && y[k] < avaliables[k].high) {
					y[k] += 1;
				} else if (env.A[j][k] >= env.A[k][m] && y[k] > avaliables[k].low) {
					y[k] -= 1;
				} else if (y[k] < avaliables[k].high) {
					y[k] += 1;
				} else if (y[k] > avaliables[k].low) {
					y[k] -= 1;
				}
			}
		}
	}
	for (var pass = 0; pass < REBALANCE_PASSES; pass++) {
		for (var t = 0; t < triplets.length; t++) {
			var j = triplets[t][0], k = triplets[t][1], m = triplets[t][2];
			var d1 = y[j] - avaliables[j].properWidth - y[k];
			var d2 = y[k] - avaliables[k].properWidth - y[m];
			var o1 = avaliables[j].y0 - avaliables[j].w0 - avaliables[k].y0;
			var o2 = avaliables[k].y0 - avaliables[k].w0 - avaliables[m].y0;
			if (!(d1 > 0 && d2 > 0 && o1 > 0 && o2 > 0)) continue;
			if (veryspare(y, j, k) && spare(y, k, m) && y[k] < avaliables[k].high && d1 / d2 >= 2 && o1 / o2 < 2 && env.P[j][k] <= env.P[k][m]) {
				y[k] += 1;
			} else if (spare(y, j, k) && veryspare(y, k, m) && y[k] > avaliables[k].low && d2 / d1 >= 2 && o2 / o1 < 2 && env.P[j][k] >= env.P[k][m]) {
				y[k] -= 1;
			}
		}
	}

	for (var j = 0; j < N; j++) {
		for (var k = 0; k < j; k++) {
			if (env.symmetry[j][k] && y[j] !== y[k]) {
				y[k] = y[j];
			}
		}
	};
	return y;
};

module.exports = balance;