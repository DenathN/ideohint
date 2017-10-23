"use strict";

// Width allocator

const { mix, xclamp } = require("../../support/common");
function edgetouch(s, t) {
	return (
		(s.xmin < t.xmin &&
			t.xmin < s.xmax &&
			s.xmax < t.xmax &&
			(s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.26) ||
		(t.xmin < s.xmin &&
			s.xmin < t.xmax &&
			t.xmax < s.xmax &&
			(t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.26)
	);
}
function cover(s, t) {
	return t.xmin > mix(s.xmin, s.xmax, 0.05) && t.xmax < mix(s.xmin, s.xmax, 0.95);
}
function spaceBelow(env, y, w, k, bottom) {
	let space = y[k] - w[k] - bottom;
	for (let j = k - 1; j >= 0; j--) {
		if (env.strictOverlaps[k][j] && y[k] - y[j] - w[k] < space) space = y[k] - y[j] - w[k];
	}
	return space;
}
function spaceAbove(env, y, w, k, top) {
	let space = top - y[k];
	for (let j = k + 1; j < y.length; j++) {
		if (env.strictOverlaps[j][k] && y[j] - y[k] - w[j] < space) space = y[j] - y[k] - w[j];
	}
	return space;
}
function atValidPosition(top, bot, y, w, avail) {
	return y >= avail.lowW && y <= avail.highW && y <= top && y >= w + avail.lowLimitW;
}

const ANY = 0;
const LESS = 1;
const SUFF = 2;

function allocateWidth(y0, env) {
	const N = y0.length;
	let allocated = new Array(N),
		y = new Array(N),
		w = new Array(N),
		properWidths = new Array(N);
	const avails = env.avails,
		strictOverlaps = env.strictOverlaps,
		strictTriplets = env.strictTriplets;
	const onePixelMatter = env.ppem <= 20;
	for (let j = 0; j < y0.length; j++) {
		properWidths[j] = Math.round(avails[j].properWidth);
		y[j] = Math.round(y0[j]);
		w[j] = 1;
	}

	let pixelTop = Math.round(env.glyphTop / env.uppx);
	let pixelBottom = Math.round(env.glyphBottom / env.uppx);

	function allocateDown(j) {
		let sb = spaceBelow(env, y, w, j, pixelBottom - 1);
		let wr = properWidths[j];
		let wx = Math.min(wr, w[j] + sb - 1);
		if (wx <= 1) return;
		if (
			(sb + w[j] >= wr + 1 || (avails[j].atGlyphBottom && y[j] - wr >= pixelBottom)) &&
			y[j] - wr >= avails[j].lowLimitW
		) {
			w[j] = wr;
			allocated[j] = true;
		} else if (y[j] - wx >= avails[j].lowLimitW) {
			w[j] = wx;
			if (w >= wr) allocated[j] = true;
		}
	}
	function relationSat(w, p, op) {
		if (op === LESS) return w < p;
		else if (op === SUFF) return p > 1 && w >= p;
		else return true;
	}
	function tripletSatisifiesPattern(j, k, m, w1, w2, w3, j1, j2, j3) {
		return (
			(!w1 || (w[j] === w1 && relationSat(w[j], properWidths[j], j1))) &&
			(!w2 || (w[k] === w2 && relationSat(w[k], properWidths[k], j2))) &&
			(!w3 || (w[m] === w3 && relationSat(w[m], properWidths[m], j3)))
		);
	}

	for (let allocPass = 0; allocPass < 5; allocPass++) {
		// Allocate top and bottom stems
		for (let j = 0; j < N; j++)
			if ((avails[j].atGlyphTop || avails[j].atGlyphBottom) && !allocated[j]) {
				allocateDown(j);
			}
		// Allocate middle stems
		for (let subpass = 0; subpass < env.strategy.WIDTH_ALLOCATION_PASSES; subpass++) {
			for (let j = 0; j < N; j++)
				if (!allocated[j]) {
					allocateDown(j);
				}
		}
	}
	// Avoid thin strokes
	for (let pass = 0; pass < env.strategy.REBALANCE_PASSES; pass++) {
		// small size
		for (let [j, k, m] of strictTriplets) {
			let y1 = y.slice(0),
				w1 = w.slice(0);
			// [1] 0 [1] 0 [1] -> [1] & [1] 1 [1]
			if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] === 0 &&
				y[k] - w[k] - y[m] === 0 &&
				env.P[j][k] > env.P[k][m] &&
				env.C[j][k] > env.C[k][m]
			) {
				y[k] -= 1;
				continue;
			} else if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] === 0 &&
				y[k] - w[k] - y[m] === 0 &&
				env.P[j][k] < env.P[k][m] &&
				env.C[j][k] < env.C[k][m]
			) {
				// [1] 0 [1] 0 [1] -> [1] 1 [1] & [1]
				y[k] += 1;
				continue;
			} else if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] === 0 &&
				y[k] - w[k] - y[m] >= 1 &&
				env.P[j][k] > env.P[k][m] &&
				env.C[j][k] > env.C[k][m]
			) {
				// [1] 0 [1] 1 [1] -> [1] 1 [1] 0 [1]
				y[k] -= 1;
				continue;
			} else if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] >= 1 &&
				y[k] - w[k] - y[m] === 0 &&
				env.P[j][k] < env.P[k][m] &&
				env.C[j][k] < env.C[k][m]
			) {
				// [1] 1 [1] 0 [1] -> [1] 0 [1] 1 [1]
				y[k] += 1;
				continue;
			} else if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] === 0 &&
				y[k] - w[k] - y[m] >= 2
			) {
				// [1] 0 [1] 2 [1] -> [1] 1 [1] 1 [1]
				y[k] -= 1;
			} else if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] >= 2 &&
				y[k] - w[k] - y[m] === 0
			) {
				// [1] 0 [1] 2 [1] -> [1] 1 [1] 1 [1]
				y[k] += 1;
			}
			// rollback when no space
			if (
				spaceBelow(env, y, w, j, pixelBottom - 1) < 1 ||
				spaceAbove(env, y, w, k, pixelTop + 1) < 1 ||
				spaceAbove(env, y, w, m, pixelTop + 1) < 1 ||
				spaceBelow(env, y, w, k, pixelBottom - 1) < 1 ||
				(j < N - 1 && y[j] > y[j + 1]) ||
				(j > 0 && y[j] < y[j - 1]) ||
				(k < N - 1 && y[k] > y[k + 1]) ||
				(k > 0 && y[k] < y[k - 1]) ||
				(m < N - 1 && y[m] > y[m + 1]) ||
				(m > 0 && y[m] < y[m - 1]) ||
				!atValidPosition(pixelTop, pixelBottom, y[k], w[k], avails[k]) ||
				!atValidPosition(pixelTop, pixelBottom, y[m], w[m], avails[m])
			) {
				y = y1;
				w = w1;
			}
		}

		// large size
		if (env.WIDTH_GEAR_PROPER < 2) continue;

		/// Thin stroke avoidance
		for (let psi = 0; psi < 3; psi++) {
			let applyToLowerOnly = [false, true, true][psi];
			// push stems down to avoid thin strokes.
			for (let j = N - 1; j >= 0; j--) {
				if (!(applyToLowerOnly || !avails[j].hasGlyphStemAbove)) continue;
				if (
					w[j] >=
					(!avails[j].hasGlyphStemAbove || env.WIDTH_GEAR_PROPER <= 2 || !onePixelMatter
						? properWidths[j]
						: 2)
				)
					continue;
				let able = true;
				// We search for strokes below,
				for (let k = 0; k < j; k++) {
					if (
						strictOverlaps[j][k] &&
						y[j] - w[j] - y[k] <= 1 &&
						(y[k] <= avails[k].lowP || y[k] <= pixelBottom + w[k] || w[k] < 2)
					) {
						able = false;
					}
				}
				if (!able) continue;
				for (let k = 0; k < j; k++)
					if (strictOverlaps[j][k] && y[j] - w[j] - y[k] <= 1) {
						y[k] -= 1;
						w[k] -= 1;
					}
				w[j] += 1;
			}
			for (let j = N - 1; j >= 0; j--) {
				if (
					w[j] >=
					(!avails[j].hasGlyphFoldBelow || env.WIDTH_GEAR_PROPER <= 2 || !onePixelMatter
						? properWidths[j]
						: 2)
				)
					continue;
				if (y[j] >= avails[j].highP) continue;
				if (!avails[j].hasGlyphStemAbove && y[j] >= pixelTop - 2) continue;

				let able = true;
				// We search for strokes above,
				for (let k = j + 1; k < N; k++) {
					if (
						strictOverlaps[k][j] &&
						y[k] - w[k] - y[j] <= 1 && // there is no stem below satisifies:
						// with one pixel space, and prevent upward adjustment, if
						(!cover(avails[j], avails[k]) || // it is not dominated with stroke J
						w[k] < properWidths[k] || // or it is thin enough
							w[k] < 2) // or it is thin enough
					) {
						able = false;
					}
				}
				if (!able) continue;
				for (let k = j + 1; k < N; k++)
					if (strictOverlaps[k][j] && y[k] - w[k] - y[j] <= 1) {
						w[k] -= 1;
					}
				y[j] += 1;
				w[j] += 1;
			}
		}
		// Doublet balancing
		for (let j = N - 1; j >= 0; j--)
			for (let k = j - 1; k >= 0; k--)
				if (strictOverlaps[j][k]) {
					let y1 = y.slice(0),
						w1 = w.slice(0);
					// [1][2] -> [1] 1 [1]
					if (
						w[j] === 1 &&
						w[k] === 2 &&
						w[k] >= properWidths[k] &&
						y[j] - y[k] === w[j]
					) {
						(w[k] -= 1), (y[k] -= 1);
					} else if (
						w[j] === 2 &&
						w[k] === 1 &&
						w[j] >= properWidths[j] &&
						y[j] - y[k] === w[j]
					) {
						// [2][1] -> [1] 1 [1]
						w[j] -= 1;
					} else if (
						w[j] === 2 &&
						w[k] === 2 &&
						w[k] >= properWidths[k] &&
						y[j] - y[k] === w[j]
					) {
						// [2][2] -> [1] 1 [2]
						if (pass % 2) {
							w[j] -= 1;
						} else {
							w[k] -= 1;
							y[k] -= 1;
						}
					} else if (
						w[j] === 3 &&
						w[k] === 1 &&
						w[k] < properWidths[k] &&
						w[j] >= properWidths[j] &&
						y[j] - y[k] === w[j] + 1
					) {
						// [3] 1 [1] -> [2] 1 [2]
						(w[j] -= 1), (w[k] += 1), (y[k] += 1);
					} else if (
						w[j] === 1 &&
						w[k] === 3 &&
						w[j] < properWidths[j] &&
						w[k] >= properWidths[k] &&
						y[j] - y[k] === w[j] + 1
					) {
						// [1] 1 [3] -> [2] 1 [2]
						(w[j] += 1), (w[k] -= 1), (y[k] -= 1);
					}
					if (
						spaceBelow(env, y, w, j, pixelBottom - 2) < 1 ||
						spaceAbove(env, y, w, k, pixelTop + 2) < 1 ||
						(j < N - 1 && y[j] > y[j + 1]) ||
						(j > 0 && y[j] < y[j - 1]) ||
						(k < N - 1 && y[k] > y[k + 1]) ||
						(k > 0 && y[k] < y[k - 1]) ||
						!atValidPosition(pixelTop, pixelBottom, y[k], w[k], avails[k])
					) {
						y = y1;
						w = w1;
					}
				}

		// Triplet balancing
		for (let [j, k, m] of strictTriplets) {
			let y1 = y.slice(0),
				w1 = w.slice(0);
			if (
				tripletSatisifiesPattern(j, k, m, 1, 1, 2, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] < 1 &&
				y[k] - w[k] - y[m] >= 1
			) {
				(y[k] -= 1), (y[m] -= 1), (w[m] -= 1);
			} else if (
				tripletSatisifiesPattern(j, k, m, 2, 1, 1, ANY, ANY, ANY) &&
				y[j] - w[j] - y[k] >= 1 &&
				y[k] - w[k] - w[m] < 1
			) {
				// [2] 1 [1] 0 [1] -> [1] 1 [1] 1 [1]
				w[j] -= 1;
				y[k] += 1;
			} else if (
				tripletSatisifiesPattern(j, k, m, 3, 3, 2, SUFF, SUFF, LESS) &&
				y[j] - w[j] - y[k] >= 2
			) {
				// [3] 2 [3] 1 [2] -> [3] 1 [3] 1 [3]
				(y[k] += 1), (y[m] += 1), (w[m] += 1);
			} else if (
				tripletSatisifiesPattern(j, k, m, 2, 3, 3, LESS, SUFF, SUFF) &&
				y[j] - w[j] - y[k] >= 2
			) {
				// [2] 2 [3] 1 [3] -> [3] 1 [3] 1 [3]
				w[j] += 1;
			} else if (
				tripletSatisifiesPattern(j, k, m, 3, 3, 2, SUFF, SUFF, LESS) &&
				y[k] - w[k] - y[m] >= 2
			) {
				// [3] 1 [3] 2 [2] -> [3] 1 [3] 1 [3]
				(y[m] += 1), (w[m] += 1);
			} else if (
				tripletSatisifiesPattern(j, k, m, 2, 3, 3, LESS, SUFF, SUFF) &&
				y[k] - w[k] - y[m] >= 2
			) {
				// [2] 1 [3] 2 [3] -> [3] 1 [3] 1 [3]
				(w[j] += 1), (y[k] -= 1);
			} else if (tripletSatisifiesPattern(j, k, m, 3, 1, 3, SUFF, LESS, SUFF)) {
				// [3] 1 [1] 1 [3] -> [2] 1 [2] 1 [3] or [3] 1 [2] 1 [2]
				if (env.P[j][k] > env.P[k][m]) {
					(w[j] -= 1), (y[k] += 1), (w[k] += 1);
				} else {
					(w[k] += 1), (y[m] -= 1), (w[m] -= 1);
				}
			} else if (tripletSatisifiesPattern(j, k, m, 3, 2, 1, SUFF, ANY, LESS)) {
				// [3] 1 [2] 1 [1] -> [2] 1 [2] 1 [2]
				(w[j] -= 1), (y[k] += 1), (y[m] += 1), (w[m] += 1);
			} else if (tripletSatisifiesPattern(j, k, m, 1, 3, 2, LESS, SUFF, ANY)) {
				// [1] 1 [3] 1 [2] -> [2] 1 [2] 1 [2]
				(w[j] += 1), (y[k] -= 1), (w[k] -= 1);
			} else if (tripletSatisifiesPattern(j, k, m, 1, 3, 3, LESS, SUFF, ANY)) {
				// [1] 1 [3] 1 [3] -> [2] 1 [2] 1 [3]
				(w[j] += 1), (y[k] -= 1), (w[k] -= 1);
			} else if (tripletSatisifiesPattern(j, k, m, 2, 1, 3, ANY, LESS, SUFF)) {
				// [2] 1 [1] 1 [3] -> [2] 1 [2] 1 [2]
				(w[k] += 1), (w[m] -= 1), (y[m] -= 1);
			} else if (tripletSatisifiesPattern(j, k, m, 2, 3, 1, ANY, SUFF, LESS)) {
				// [2] 1 [3] 1 [1] -> [2] 1 [2] 1 [2]
				(w[k] -= 1), (w[m] += 1), (y[m] += 1);
			} else if (tripletSatisifiesPattern(j, k, m, 3, 3, 1, ANY, SUFF, LESS)) {
				// [3] 1 [3] 1 [1] -> [2] 1 [2] 1 [2]
				(w[k] -= 1), (w[m] += 1), (y[m] += 1);
			} else if (tripletSatisifiesPattern(j, k, m, 3, 1, 2, SUFF, LESS, ANY)) {
				// [3] 1 [1] 1 [2] -> [2] 1 [2] 1 [2]
				(w[j] -= 1), (y[k] += 1), (w[k] += 1);
			} else if (tripletSatisifiesPattern(j, k, m, 1, 2, 3, LESS, ANY, SUFF)) {
				// [1] 1 [2] 1 [3] -> [2] 1 [2] 1 [2]
				(w[j] += 1), (w[m] -= 1), (y[k] -= 1), (y[m] -= 1);
			} else if (
				tripletSatisifiesPattern(j, k, m, 1, 2, 2, LESS, SUFF, SUFF) &&
				y[k] - w[k] - y[m] > 1
			) {
				// [1] 1 [2] 2 [2] -> [2] 1 [2] 1 [2]
				(w[j] += 1), (y[k] -= 1);
			} else if (
				tripletSatisifiesPattern(j, k, m, 2, 2, 1, SUFF, ANY, LESS) &&
				y[j] - w[j] - y[k] > 1
			) {
				// [2] 2 [2] 1 [1] -> [2] 1 [2] 1 [2]
				(y[k] += 1), (y[m] += 1), (w[m] += 1);
			} else if (
				avails[j].atGlyphTop &&
				tripletSatisifiesPattern(j, k, m, 1, 1, 2, LESS, ANY, SUFF)
			) {
				// [1T] 1 [1] 1 [2] -> [2] 1 [1] 1 [1]
				(w[m] -= 1), (w[j] += 1), (y[m] -= 1), (y[k] -= 1);
			} else if (
				avails[j].atGlyphTop &&
				w[j] < properWidths[j] &&
				w[k] >= properWidths[k] &&
				properWidths[k] > 1
			) {
				// [1T] 1 [2] 1 [*] -> [2] 1 [1] 1 [*]
				(w[k] -= 1), (y[k] -= 1), (w[j] += 1);
			}

			// rollback when no space
			if (
				spaceBelow(env, y, w, j, pixelBottom - 1) < 1 ||
				spaceAbove(env, y, w, k, pixelTop + 1) < 1 ||
				spaceAbove(env, y, w, m, pixelTop + 1) < 1 ||
				spaceBelow(env, y, w, k, pixelBottom - 1) < 1 ||
				(j < N - 1 && y[j] > y[j + 1]) ||
				(j > 0 && y[j] < y[j - 1]) ||
				(k < N - 1 && y[k] > y[k + 1]) ||
				(k > 0 && y[k] < y[k - 1]) ||
				(m < N - 1 && y[m] > y[m + 1]) ||
				(m > 0 && y[m] < y[m - 1]) ||
				!atValidPosition(pixelTop, pixelBottom, y[k], w[k], avails[k]) ||
				!atValidPosition(pixelTop, pixelBottom, y[m], w[m], avails[m])
			) {
				y = y1;
				w = w1;
			}
		}

		// Edge touch balancing
		for (let j = 0; j < N; j++) {
			if (w[j] <= 1 && w[j] < properWidths[j] && y[j] > pixelBottom + 2) {
				let able = true;
				for (let k = 0; k < j; k++)
					if (strictOverlaps[j][k] && !edgetouch(avails[j], avails[k])) {
						able = false;
					}
				if (able) {
					w[j] += 1;
				}
			}
		}

		for (let j = 0; j < N; j++) {
			w[j] = Math.min(w[j], y[j] - pixelBottom);
			if (w[j] > 1 && !avails[j].atGlyphBottom && y[j] - w[j] === pixelBottom) {
				w[j] -= 1;
			}
			// For bottommost stems with a folds below, reduce stroke width when it compresses the thing below.
			if (
				avails[j].hasFoldBelow &&
				y[j] < avails[j].low &&
				w[j] === properWidths[j] &&
				w[j] > 1
			) {
				w[j] -= 1;
			}
		}
	}

	// Triplet whitespace balancing
	for (let pass = 0; pass < env.strategy.REBALANCE_PASSES; pass++) {
		for (let [j, k, m] of strictTriplets) {
			const su = spaceAbove(env, y, w, k, pixelTop + 2);
			const sb = spaceBelow(env, y, w, k, pixelBottom - 2);
			const d1 = y[j] - w[j] - y[k];
			const d2 = y[k] - w[k] - y[m];
			const o1 = avails[j].y0 - avails[j].w0 - avails[k].y0;
			const o2 = avails[k].y0 - avails[k].w0 - avails[m].y0;
			const o1o2 = o1 / o2;
			if (
				su > 1 &&
				(sb < 1 || d1 >= d2 * 1.66) &&
				o1o2 <= 0.9 &&
				y[k] < avails[k].highW &&
				(k === N + 1 || y[k] + 1 <= y[k + 1]) &&
				env.P[j][k] <= env.P[k][m]
			) {
				// A distorted triplet space, but we can adjust this stem up.
				y[k] += 1;
				if (
					properWidths[k] > w[k] &&
					Math.abs((d1 - 1) / (d2 + 1) - o1o2) > Math.abs((d1 - 1) / d2 - o1o2)
				) {
					w[k] += 1;
				}
			} else if (
				sb > 1 &&
				(su < 1 || d2 >= d1 * 1.66) &&
				o1o2 >= 1.1 &&
				env.P[j][k] >= env.P[k][m]
			) {
				if (w[k] < properWidths[k]) {
					// A distorted triplet space, but we increase the middle stem’s weight
					w[k] += 1;
				} else if (
					y[k] > avails[k].lowW &&
					(k === 0 || y[k] - 1 >= y[k - 1]) &&
					!(
						d2 < 3 &&
						avails[j].posKeyAtTop &&
						avails[k].posKeyAtTop &&
						!avails[m].posKeyAtTop
					)
				) {
					// A distorted triplet space, but we can adjust this stem down.
					y[k] -= 1;
					if (
						w[j] < properWidths[j] &&
						Math.abs((d1 + 1) / (d2 - 1) - o1o2) > Math.abs(d1 / (d2 - 1) - o1o2) &&
						spaceBelow(env, y, w, j, pixelBottom - 2) > 1
					) {
						w[j] += 1;
					}
				}
			}
		}
	}
	// Prevent swap
	for (let j = y.length - 2; j >= 0; j--) {
		if (y[j] > y[j + 1]) {
			const su = spaceAbove(env, y, w, j + 1, pixelTop + 2);
			const sb = spaceBelow(env, y, w, j, pixelBottom - 2);
			if (sb > y[j] - y[j + 1]) {
				y[j] = xclamp(avails[j].lowW, y[j + 1], avails[j].highW);
			} else if (su > y[j] - y[j + 1]) {
				y[j + 1] = xclamp(avails[j + 1].lowW, y[j], avails[j + 1].highW);
			}
		}
	}
	return { y: y, w: w };
}

module.exports = allocateWidth;
