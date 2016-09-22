"use strict"
function mix(a, b, x) { return a + (b - a) * x }
function spare(y, w, p, q) { return y[p] - y[q] > w[p]; }
function veryspare(y, w, p, q) { return y[p] - y[q] > w[p] + 1; }
function edgetouch(s, t) {
	return (s.xmin < t.xmin && t.xmin < s.xmax && s.xmax < t.xmax && (s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.26)
		|| (t.xmin < s.xmin && s.xmin < t.xmax && t.xmax < s.xmax && (t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.26)
};
function cover(s, t) {
	return (t.xmin > mix(s.xmin, s.xmax, 0.05) && t.xmax < mix(s.xmin, s.xmax, 0.95))
}
function spaceBelow(env, y, w, k, bottom) {
	var space = y[k] - w[k] - bottom;
	for (var j = k - 1; j >= 0; j--) {
		if (env.strictOverlaps[k][j] && y[k] - y[j] - w[k] < space)
			space = y[k] - y[j] - w[k]
	}
	return space;
}
function spaceAbove(env, y, w, k, top) {
	var space = top - y[k];
	for (var j = k + 1; j < y.length; j++) {
		if (env.strictOverlaps[j][k] && y[j] - y[k] - w[j] < space)
			space = y[j] - y[k] - w[j]
	}
	return space;
}

var ANY = 0;
var LESS = 1;
var SUFF = 2;

function allocateWidth(y0, env) {
	var N = y0.length;
	var allocated = new Array(N), y = new Array(N), w = new Array(N), properWidths = new Array(N);
	var avaliables = env.avaliables, strictOverlaps = env.strictOverlaps, strictTriplets = env.strictTriplets;
	for (var j = 0; j < y0.length; j++) {
		properWidths[j] = Math.round(avaliables[j].properWidth);
		y[j] = Math.round(y0[j]);
		w[j] = 1;
	};

	var pixelTopPixels = Math.round(env.pixelTop / env.uppx);
	var pixelBottomPixels = Math.round(env.pixelBottom / env.uppx);

	function allocateDown(j) {
		var sb = spaceBelow(env, y, w, j, pixelBottomPixels - 1);
		var wr = properWidths[j];
		var wx = Math.min(wr, w[j] + sb - 1);
		if (wx <= 1) return;
		if (sb + w[j] >= wr + 1 && y[j] - wr >= pixelBottomPixels + (avaliables[j].hasGlyphFoldBelow ? 2 : 1) || avaliables[j].atGlyphBottom && y[j] - wr >= pixelBottomPixels) {
			w[j] = wr;
			allocated[j] = true;
		} else if (y[j] - wx >= pixelBottomPixels + (avaliables[j].hasGlyphFoldBelow ? 2 : 1) || avaliables[j].atGlyphBottom && y[j] - wx >= pixelBottomPixels) {
			w[j] = wx;
			if (w >= wr) allocated[j] = true;
		}
	};
	function relationSat(w, p, op) {
		if (op === LESS) return w < p;
		else if (op === SUFF) return (p > 1 && w >= p);
		else return true;
	}
	function tripletSatisifiesPattern(j, k, m, w1, w2, w3, j1, j2, j3) {
		return (!w1 || w[j] === w1 && relationSat(w[j], properWidths[j], j1))
			&& (!w2 || w[k] === w2 && relationSat(w[k], properWidths[k], j2))
			&& (!w3 || w[m] === w3 && relationSat(w[m], properWidths[m], j3))
	}

	for (var pass = 0; pass < 5; pass++) {
		// Allocate top and bottom stems
		for (var j = 0; j < N; j++) if ((avaliables[j].atGlyphTop || avaliables[j].atGlyphBottom) && !allocated[j]) { allocateDown(j) };
		for (var subpass = 0; subpass < env.strategy.WIDTH_ALLOCATION_PASSES; subpass++) {
			for (var j = 0; j < N; j++) if (!allocated[j]) { allocateDown(j) };
		}
	}

	// Avoid thin strokes
	for (var pass = 0; pass < env.strategy.REBALANCE_PASSES; pass++) if (env.WIDTH_GEAR_PROPER >= 2 && env.WIDTH_GEAR_MIN >= 2) {
		for (var psi = 0; psi < 3; psi++) {
			var applyToLowerOnly = [false, true, true][psi];
			var minShrinkStrokeLength = [2, 3, 3][psi];

			for (var j = N - 1; j >= 0; j--) {
				if (!(applyToLowerOnly || !avaliables[j].hasGlyphStemAbove) || w[j] >= (!avaliables[j].hasGlyphStemAbove ? properWidths[j] : 2)) continue;
				var able = true;
				// We search for strokes below,
				for (var k = 0; k < j; k++) if (strictOverlaps[j][k] && y[j] - w[j] - y[k] <= 1
					// with one pixel space, and see do the lower-adjustment, unless...
					&& ( // there is no stem below satisifies:
						y[k] <= avaliables[k].low // It is already low enough, or
						|| y[k] <= pixelBottomPixels + w[k] // There is no space, or
						|| w[k] < 2 // It is already thin enough, or 
					) // It is a dominator, and it has only one or two pixels
				) {
					able = false;
				}

				if (able) {
					for (var k = 0; k < j; k++) if (strictOverlaps[j][k] && y[j] - w[j] - y[k] <= 1) {
						y[k] -= 1;
						w[k] -= 1;
					}
					w[j] += 1;
				}
			}
			for (var j = N - 1; j >= 0; j--) {
				if (w[j] >= (!avaliables[j].hasGlyphFoldBelow ? properWidths[j] : 2) || y[j] >= avaliables[j].highW || (!avaliables[j].hasGlyphStemAbove && y[j] >= pixelTopPixels - 2)) continue;
				var able = true;
				// We search for strokes above,
				for (var k = j + 1; k < N; k++) if (strictOverlaps[k][j] && y[k] - w[k] - y[j] <= 1
					// with one pixel space, and prevent upward adjustment, if
					&& ( // there is no stem below satisifies:
						!cover(avaliables[j], avaliables[k]) // it is not dominated with stroke J
						|| w[k] < properWidths[k]) // or it is thin enough
				) {
					able = false;
				}

				if (able) {
					for (var k = j + 1; k < N; k++) if (strictOverlaps[k][j] && y[k] - w[k] - y[j] <= 1) {
						w[k] -= 1;
					}
					y[j] += 1;
					w[j] += 1;
				}
			}
		}
		// Doublet balancing
		for (var j = N - 1; j >= 0; j--) for (var k = j - 1; k >= 0; k--) if (strictOverlaps[j][k]) {
			var y1 = y.slice(0), w1 = w.slice(0);
			// [1][2] -> [1] 1 [1]
			if (w[j] === 1 && w[k] === 2 && w[k] === properWidths[k] && y[j] - y[k] === 1) {
				w[k] -= 1;
				y[k] -= 1;
			}
			// [2][2] -> [2] 1 [1]
			else if (w[j] === 2 && w[k] === 2 && w[k] === properWidths[k] && y[j] - y[k] === 2) {
				w[k] -= 1;
				y[k] -= 1;
			}
			if (spaceBelow(env, y, w, j, pixelBottomPixels - 1) < 1
				|| spaceAbove(env, y, w, k, pixelTopPixels + 1) < 1
				|| y[k] < avaliables[k].lowW || y[k] > avaliables[k].highW) {
				y = y1; w = w1;
			}
		}
		// Triplet balancing
		for (var t = 0; t < strictTriplets.length; t++) {
			var j = strictTriplets[t][0], k = strictTriplets[t][1], m = strictTriplets[t][2];
			var y1 = y.slice(0), w1 = w.slice(0);
			// [3] 2 [3] 1 [2] -> [3] 1 [3] 1 [3]
			if (tripletSatisifiesPattern(j, k, m, 3, 3, 2, SUFF, SUFF, LESS) && y[j] - w[j] - y[k] >= 2) {
				y[k] += 1, y[m] += 1, w[m] += 1;
			}
			// [2] 2 [3] 1 [3] -> [3] 1 [3] 1 [3]
			else if (tripletSatisifiesPattern(j, k, m, 2, 3, 3, LESS, SUFF, SUFF) && y[j] - w[j] - y[k] >= 2) {
				w[j] += 1;
			}
			// [3] 1 [3] 2 [2] -> [3] 1 [3] 1 [3]
			else if (tripletSatisifiesPattern(j, k, m, 3, 3, 2, SUFF, SUFF, LESS) && y[k] - w[k] - y[m] >= 2) {
				y[m] += 1, w[m] += 1;
			}
			// [2] 1 [3] 2 [3] -> [3] 1 [3] 1 [3]
			else if (tripletSatisifiesPattern(j, k, m, 2, 3, 3, LESS, SUFF, SUFF) && y[k] - w[k] - y[m] >= 2) {
				w[j] += 1, y[k] -= 1;
			}
			// [3] 1 [1] 1 [3] -> [2] 1 [2] 1 [3] or [3] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 3, 1, 3, SUFF, LESS, SUFF)) {
				if (env.P[j][k] > env.P[k][m]) {
					w[j] -= 1, y[k] += 1, w[k] += 1;
				} else {
					w[k] += 1, y[m] -= 1, w[m] -= 1;
				}
			}
			// [3] 1 [2] 1 [1] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 3, 2, 1, SUFF, ANY, LESS)) {
				w[j] -= 1, y[k] += 1, y[m] += 1, w[m] += 1;
			}
			// [1] 1 [3] 1 [2] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 1, 3, 2, LESS, SUFF, ANY)) {
				w[j] += 1, y[k] -= 1, w[k] -= 1;
			}
			// [2] 1 [1] 1 [3] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 2, 1, 3, ANY, LESS, SUFF)) {
				w[k] += 1, w[m] -= 1, y[m] -= 1;
			}
			// [2] 1 [3] 1 [1] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 2, 3, 1, ANY, SUFF, LESS)) {
				w[k] -= 1, w[m] += 1, y[m] += 1;
			}
			// [3] 1 [1] 1 [2] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 3, 1, 2, SUFF, LESS, ANY)) {
				w[j] -= 1, y[k] += 1, w[k] += 1;
			}
			// [1] 1 [2] 1 [3] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 1, 2, 3, LESS, ANY, SUFF)) {
				w[j] += 1, w[m] -= 1, y[k] -= 1, y[m] -= 1;
			}
			// [1] 1 [2] 2 [2] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 1, 2, 2, LESS, SUFF, SUFF) && y[k] - w[k] - y[m] > 1) {
				w[j] += 1, y[k] -= 1;
			}
			// [2] 2 [2] 1 [1] -> [2] 1 [2] 1 [2]
			else if (tripletSatisifiesPattern(j, k, m, 2, 2, 1, SUFF, ANY, LESS) && y[j] - w[j] - y[k] > 1) {
				y[k] += 1, y[m] += 1, w[m] += 1;
			}
			// [1T] 1 [1] 1 [2] -> [2] 1 [1] 1 [1]
			else if (avaliables[j].atGlyphTop && tripletSatisifiesPattern(j, k, m, 1, 1, 2, LESS, ANY, SUFF)) {
				w[m] -= 1, w[j] += 1, y[m] -= 1, y[k] -= 1
			}
			// [1T] 1 [2] 1 [*] -> [2] 1 [1] 1 [*]
			else if (avaliables[j].atGlyphTop && w[j] <= properWidths[j] - 1 && w[k] >= properWidths[k]) {
				w[k] -= 1, y[k] -= 1, w[j] += 1
			}

			// rollback when no space
			if (spaceBelow(env, y, w, j, pixelBottomPixels - 1) < 1
				|| spaceAbove(env, y, w, k, pixelTopPixels + 1) < 1
				|| spaceAbove(env, y, w, m, pixelTopPixels + 1) < 1
				|| spaceBelow(env, y, w, k, pixelBottomPixels - 1) < 1
				|| y[k] < avaliables[k].lowW || y[k] > avaliables[k].highW
				|| y[m] < avaliables[m].lowW || y[m] > avaliables[m].highW) {
				y = y1; w = w1;
			}
		}
		// Edge touch balancing
		for (var j = 0; j < N; j++) {
			if (w[j] <= 1 && y[j] > pixelBottomPixels + 2) {
				var able = true;
				for (var k = 0; k < j; k++) if (strictOverlaps[j][k] && !edgetouch(avaliables[j], avaliables[k])) {
					able = false;
				}
				if (able) {
					w[j] += 1;
				}
			}
		}

		for (var j = 0; j < N; j++) {
			w[j] = Math.min(w[j], y[j] - pixelBottomPixels);
			// For bottommost stems with a folds below, reduce stroke width when it compresses the thing below.
			if (avaliables[j].hasFoldBelow && y[j] < avaliables[j].low && w[j] === properWidths[j] && w[j] > 1) {
				w[j] -= 1;
			}
		}
	};

	// Triplet whitespace balancing
	for (var pass = 0; pass < env.strategy.REBALANCE_PASSES; pass++) {
		for (var t = 0; t < strictTriplets.length; t++) {
			var j = strictTriplets[t][0], k = strictTriplets[t][1], m = strictTriplets[t][2];
			var su = spaceAbove(env, y, w, k, pixelTopPixels + 2);
			var sb = spaceBelow(env, y, w, k, pixelBottomPixels - 2);
			var d1 = y[j] - w[j] - y[k];
			var d2 = y[k] - w[k] - y[m];
			var o1 = avaliables[j].y0 - avaliables[j].w0 - avaliables[k].y0;
			var o2 = avaliables[k].y0 - avaliables[k].w0 - avaliables[m].y0;
			if (su > 1 && (sb < 1 || d1 >= d2 * 1.66) && y[k] < avaliables[k].highW && o1 / o2 <= 1.25 && env.P[j][k] <= env.P[k][m]) {
				// A distorted triplet space, but we can adjust this stem up.
				y[k] += 1;
			} else if (sb > 1 && (su < 1 || d2 >= d1 * 1.66) && o2 / o1 <= 1.25 && env.P[j][k] >= env.P[k][m]) {
				if (w[k] < properWidths[k]) {
					// A distorted triplet space, but we increase the middle stem’s weight
					w[k] += 1;
				} else if (y[k] > avaliables[k].lowW) {
					// A distorted triplet space, but we can adjust this stem down.
					y[k] -= 1;
				}
			}
		}
	}
	return { y: y, w: w }
};

module.exports = allocateWidth;
