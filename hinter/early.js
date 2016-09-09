"use strict"

function xclamp(low, x, high) { return x < low ? low : x > high ? high : x }

function earlyAllocate(y, N, j, allocated, env) {
	var ymax = -999;
	var avaliables = env.avaliables, directOverlaps = env.directOverlaps;
	// Find the high point of stems below stem j
	for (var k = 0; k < j; k++) if (directOverlaps[j][k] && y[k] > ymax) {
		ymax = y[k];
	};
	var c = Math.round(avaliables[j].center);
	if (avaliables[j].low >= ymax + 2) {
		y[j] = avaliables[j].low;
	} else if (c >= ymax + 2) {
		y[j] = c
	} else if (avaliables[j].high >= ymax + 2) {
		// Place upward
		y[j] = xclamp(avaliables[j].low, ymax + 2, avaliables[j].high)
	} else if (avaliables[j].low <= ymax && avaliables[j].high >= ymax) {
		// merge
		y[j] = ymax;
	} else {
		y[j] = xclamp(avaliables[j].low, c, avaliables[j].high);
	};
	allocated[j] = true;
	for (var k = j + 1; k < N; k++) if (!allocated[k]) earlyAllocate(y, N, k, allocated, env);
}
function earlyAdjust(N, env) {
	var y0 = [];
	var allocated = [];
	earlyAllocate(y0, N, 0, allocated, env);
	return y0;
};

module.exports = earlyAdjust;