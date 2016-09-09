"use strict"
function mix(a, b, x) { return a + (b - a) * x }

function edgetouch(s, t) {
	return (s.xmin < t.xmin && t.xmin < s.xmax && s.xmax < t.xmax && (s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.26)
		|| (t.xmin < s.xmin && s.xmin < t.xmax && t.xmax < s.xmax && (t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.26)
};
function cover(s, t) {
	return (t.xmin > mix(s.xmin, s.xmax, 0.1) && t.xmax < mix(s.xmin, s.xmax, 0.9))
}
function spaceBelow(env, y, w, k, bottom) {
	var space = y[k] - w[k] - bottom;
	for (var j = k - 1; j >= 0; j--) {
		if (env.directOverlaps[k][j] && Math.abs(y[k] - y[j]) - w[k] < space)
			space = y[k] - y[j] - w[k]
	}
	return space;
}
function spaceAbove(env, y, w, k, top) {
	var space = top - y[k];
	for (var j = k + 1; j < y.length; j++) {
		if (env.directOverlaps[j][k] && Math.abs(y[j] - y[k]) - w[j] < space)
			space = y[j] - y[k] - w[j]
	}
	return space;
}
function allocateWidth(y0, env) {
	var N = y0.length;
	var allocated = new Array(N), y = new Array(N), w = new Array(N), properWidths = new Array(N);
	var avaliables = env.avaliables, directOverlaps = env.directOverlaps, triplets = env.triplets;
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
	function allocateUp(j) {
		var sb = spaceBelow(env, y, w, j, pixelBottomPixels - 1);
		var sa = spaceAbove(env, y, w, j, pixelTopPixels + 1);
		var wr = properWidths[j];
		var wx = Math.min(wr, w[j] + sb);
		if (wx <= 1) return;
		if (sa > 1.75 && y[j] < avaliables[j].high) {
			if (sb + w[j] >= wr && y[j] - wr >= pixelBottomPixels || avaliables[j].atGlyphBottom && y[j] - wr + 1 >= pixelBottomPixels) {
				y[j] += 1;
				w[j] = wr;
				allocated[j] = true;
			} else if (y[j] - wx >= pixelBottomPixels || avaliables[j].atGlyphBottom && y[j] - wx + 1 >= pixelBottomPixels) {
				y[j] += 1;
				w[j] = wx;
				if (wx >= wr) allocated[j] = true;
			}
		}
	};

	for (var pass = 0; pass < 5; pass++) {
		// Allocate top and bottom stems
		for (var j = 0; j < N; j++) if ((avaliables[j].atGlyphTop || avaliables[j].atGlyphBottom) && !allocated[j]) { allocateDown(j) };
		for (var j = N - 1; j >= 0; j--) if ((avaliables[j].atGlyphTop || avaliables[j].atGlyphBottom) && !allocated[j]) { allocateUp(j) };
		// Allocate center stems
		for (var subpass = 0; subpass < env.strategy.WIDTH_ALLOCATION_PASSES; subpass++) {
			for (var j = 0; j < N; j++) if (!allocated[j]) { allocateDown(j) };
			for (var j = N - 1; j >= 0; j--) if (!allocated[j]) { allocateUp(j) };
		}
	}

	// Avoid thin strokes
	for (var pass = 0; pass < 3; pass++) if (env.WIDTH_GEAR_PROPER >= 2 && env.WIDTH_GEAR_MIN >= 2) {
		for (var psi = 0; psi < 2; psi++) for (var j = N - 1; j >= 0; j--) if (([false, true][psi] || !avaliables[j].hasGlyphStemAbove) && w[j] < [properWidths[j], 2][psi]) {
			var able = true;
			for (var k = 0; k < j; k++) if (directOverlaps[j][k] && y[j] - w[j] - y[k] <= 1 && w[k] < (cover(avaliables[j], avaliables[k]) ? 2 : [2, 3][psi])) able = false;
			if (able) {
				w[j] += 1;
				for (var k = 0; k < j; k++) if (directOverlaps[j][k] && y[j] - w[j] - y[k] <= 0) {
					y[k] -= 1;
					w[k] -= 1;
				}
			}
		}
		for (var j = 0; j < N; j++) if (avaliables[j].hasGlyphStemAbove && w[j] <= 1) {
			var able = true;
			for (var k = j + 1; k < N; k++) {
				if (directOverlaps[k][j] && y[k] - y[j] <= w[k] + 1 && w[k] <= 2) able = false;
			}
			if (able) {
				for (var k = j + 1; k < N; k++) if (directOverlaps[k][j] && y[k] - y[j] <= w[k] + 1) {
					w[k] -= 1
				}
				y[j] += 1;
				w[j] += 1;
			}
		};

		// Triplet balancing
		for (var t = 0; t < triplets.length; t++) {
			var j = triplets[t][0], k = triplets[t][1], m = triplets[t][2];
			var y1 = y.slice(0), w1 = w.slice(0);
			// [3] 2 [3] 1 [2] -> [3] 1 [3] 1 [3]
			if (properWidths[j] > 2 && w[m] <= properWidths[j] - 1 && y[j] - w[j] - y[k] >= 2 && y[k] - w[k] - y[m] === 1) {
				y[k] += 1, y[m] += 1, w[m] += 1;
			}
			// [2] 2 [3] 1 [3] -> [3] 1 [3] 1 [3]
			else if (properWidths[m] > 2 && w[j] <= properWidths[j] - 1 && y[j] - w[j] - y[k] >= 2 && y[k] - w[k] - y[m] === 1) {
				w[j] += 1;
			}
			// [3] 1 [3] 2 [2] -> [3] 1 [3] 1 [3]
			else if (properWidths[j] > 2 && w[m] <= properWidths[j] - 1 && y[j] - w[j] - y[k] === 1 && y[k] - w[k] - y[m] >= 2) {
				y[m] += 1, w[m] += 1;
			}
			// [2] 1 [3] 2 [3] -> [3] 1 [3] 1 [3]
			else if (properWidths[m] > 2 && w[j] <= properWidths[j] - 1 && y[j] - w[j] - y[k] === 1 && y[k] - w[k] - y[m] >= 2) {
				w[j] += 1, y[k] -= 1;
			}
			// [3] 1 [2] 1 [1] -> [2] 1 [2] 1 [2]
			else if (properWidths[j] > 2 && w[j] == properWidths[j] && w[k] <= properWidths[j] - 1 && w[m] <= properWidths[j] - 2) {
				w[j] -= 1, y[k] += 1, y[m] += 1, w[m] += 1;
			}
			// [1] 1 [2] 1 [3] -> [2] 1 [2] 1 [2]
			else if (properWidths[m] > 2 && w[m] == properWidths[m] && w[k] <= properWidths[j] - 1 && w[j] <= properWidths[j] - 2) {
				w[j] += 1, w[m] -= 1, y[k] -= 1, y[m] -= 1;
			}
			// [1] 1 [2] 2 [2] -> [2] 1 [2] 1 [2]
			else if (w[j] <= properWidths[j] - 1 && y[j] - w[j] - y[k] === 1 && y[k] - w[k] - y[m] === 2) {
				w[j] += 1, y[k] -= 1;
			}

			// rollback when no space
			if (spaceAbove(env, y, w, k, pixelTopPixels + 1) < 1 || spaceAbove(env, y, w, m, pixelTopPixels + 1) < 1 || spaceBelow(env, y, w, k, pixelBottomPixels - 1) < 1) {
				y = y1; w = w1;
			}
		}
		// Edge touch balancing
		for (var j = 0; j < N; j++) {
			if (w[j] <= 1 && y[j] > pixelBottomPixels + 2) {
				var able = true;
				for (var k = 0; k < j; k++) if (directOverlaps[j][k] && !edgetouch(avaliables[j], avaliables[k])) {
					able = false;
				}
				if (able) {
					w[j] += 1;
				}
			}
		}
	};

	return { y: y, w: w }
};

module.exports = allocateWidth;
