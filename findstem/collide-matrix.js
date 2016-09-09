"use strict"

var slopeOf = require('../types').slopeOf;

function adjacent(z1, z2) {
	return z1.prev === z2 || z2.prev === z1;
}
function segmentsPromixity(s1, s2) {
	var count = 0;
	for (var j = 0; j < s1.length; j++) for (var k = 0; k < s2.length; k++) {
		if (adjacent(s1[j][0], s2[k][0])) count += 1;
		if (adjacent(s1[j][0], s2[k][1])) count += 1;
		if (adjacent(s1[j][1], s2[k][0])) count += 1;
		if (adjacent(s1[j][1], s2[k][1])) count += 1;
	}
	return 2 * count / (s1.length + s2.length);
}

function atRadicalTop(stem, strategy) {
	return !stem.hasSameRadicalStemAbove
		&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > strategy.STEM_CENTER_MIN_RISE)
		&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > strategy.STEM_SIDE_MIN_RISE)
		&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > strategy.STEM_SIDE_MIN_RISE)
}
function atRadicalBottom(stem, strategy) {
	return !stem.hasSameRadicalStemBelow
		&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > strategy.STEM_CENTER_MIN_DESCENT)
		&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
		&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
}

module.exports = function calculateCollisionMatrices(strategy, stems, overlaps, overlapLengths, pbs) {
	// A : Alignment operator
	// C : Collision operator
	// S : Swap operator
	var A = [], C = [], S = [], P = [], n = stems.length;
	for (var j = 0; j < n; j++) {
		A[j] = [];
		C[j] = [];
		S[j] = [];
		P[j] = [];
		for (var k = 0; k < n; k++) {
			A[j][k] = C[j][k] = S[j][k] = P[j][k] = 0
		}
	};
	var slopes = stems.map(function (s) { return (slopeOf(s.high) + slopeOf(s.low)) / 2 });
	for (var j = 0; j < n; j++) {
		for (var k = 0; k < j; k++) {
			// Overlap weight
			var ovr = overlaps[j][k] * overlapLengths[j][k];
			var isSideTouch = stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax
				|| stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax;
			// For side touches witn low overlap, drop it.
			if (ovr < strategy.SIDETOUCH_LIMIT && isSideTouch) { ovr = 0; }

			var slopesCoeff = !pbs[j][k] && stems[j].belongRadical === stems[k].belongRadical ? Math.max(0.25, 1 - Math.abs(slopes[j] - slopes[k]) * 20) : 1;
			var promixity = segmentsPromixity(stems[j].low, stems[k].high) + segmentsPromixity(stems[j].high, stems[k].low) + segmentsPromixity(stems[j].low, stems[k].low) + segmentsPromixity(stems[j].high, stems[k].high);
			if (pbs[j][k] && promixity < 3) { promixity = 3; }
			var promixityCoeff = (1 + (promixity > 2 ? strategy.COEFF_C_MULTIPLIER / strategy.COEFF_A_MULTIPLIER : 1) * promixity);
			// Alignment coefficients
			var coeffA = 1;
			if (pbs[j][k]) {
				coeffA = strategy.COEFF_A_FEATURE_LOSS
			} else if (stems[j].belongRadical === stems[k].belongRadical) {
				if (!stems[j].hasSameRadicalStemAbove || !stems[k].hasSameRadicalStemBelow) {
					coeffA = strategy.COEFF_A_SHAPE_LOST
				} else {
					coeffA = strategy.COEFF_A_SAME_RADICAL
				}
			} else if (atRadicalBottom(stems[j], strategy) && atRadicalTop(stems[k], strategy)) {
				coeffA = strategy.COEFF_A_RADICAL_MERGE
			}
			A[j][k] = strategy.COEFF_A_MULTIPLIER * ovr * coeffA * promixityCoeff * slopesCoeff;

			// Collision coefficients
			var coeffC = 1;
			if (stems[j].belongRadical === stems[k].belongRadical) coeffC = strategy.COEFF_C_SAME_RADICAL;
			if (pbs[j][k]) coeffC *= strategy.COEFF_C_FEATURE_LOSS / 2;
			C[j][k] = strategy.COEFF_C_MULTIPLIER * ovr * coeffC * slopesCoeff;

			S[j][k] = strategy.COEFF_S;
			P[j][k] = promixity + (pbs[j][k] ? 1 : 0);
		};
	};
	for (var j = 0; j < n; j++) {
		var isBottomMost = true;
		for (var k = 0; k < j; k++) { if (C[j][k] > 0) isBottomMost = false };
		if (isBottomMost) {
			for (var k = j + 1; k < n; k++) {
				var isSideTouch = stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax
					|| stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax;
				var mindiff = Math.abs(stems[j].xmax - stems[k].xmin);
				var maxdiff = Math.abs(stems[j].xmin - stems[k].xmax);
				var unbalance = (mindiff + maxdiff <= 0) ? 0 : Math.abs(mindiff - maxdiff) / (mindiff + maxdiff);
				if (!isSideTouch && unbalance >= strategy.TBST_LIMIT) A[k][j] *= strategy.COEFF_A_FEATURE_LOSS;
			}
		}
	}
	for (var j = 0; j < n; j++) {
		var isTopMost = true;
		for (var k = j + 1; k < n; k++) { if (C[k][j] > 0) isTopMost = false };
		if (isTopMost) {
			for (var k = 0; k < j; k++) {
				var isSideTouch = stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax
					|| stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax;
				var mindiff = Math.abs(stems[j].xmax - stems[k].xmin);
				var maxdiff = Math.abs(stems[j].xmin - stems[k].xmax);
				var unbalance = (mindiff + maxdiff <= 0) ? 0 : Math.abs(mindiff - maxdiff) / (mindiff + maxdiff);
				if (!isSideTouch && unbalance >= strategy.TBST_LIMIT) A[j][k] *= strategy.COEFF_A_FEATURE_LOSS;
			}
		}
	}
	return {
		alignment: A,
		collision: C,
		promixity: P,
		swap: S
	}
};