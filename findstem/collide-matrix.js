"use strict";

var slopeOf = require("../types").slopeOf;
var segmentsPromixity = require("./seg").segmentsPromixity;

function atRadicalTop(stem, strategy) {
	return !stem.hasSameRadicalStemAbove
		&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > strategy.STEM_CENTER_MIN_RISE)
		&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > strategy.STEM_SIDE_MIN_RISE)
		&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > strategy.STEM_SIDE_MIN_RISE);
}
function atRadicalBottom(stem, strategy) {
	return !stem.hasSameRadicalStemBelow
		&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > strategy.STEM_CENTER_MIN_DESCENT)
		&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
		&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT);
}

function atGlyphTop(stem, strategy) {
	return atRadicalTop(stem, strategy) && !stem.hasGlyphStemAbove
		&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > strategy.STEM_CENTER_MIN_RISE)
		&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > strategy.STEM_SIDE_MIN_RISE)
		&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > strategy.STEM_SIDE_MIN_RISE);
}
function atGlyphBottom(stem, strategy) {
	return atRadicalBottom(stem, strategy) && !stem.hasGlyphStemBelow
		&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > strategy.STEM_CENTER_MIN_DESCENT)
		&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
		&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT);
}


module.exports = function calculateCollisionMatrices(strategy, stems, overlapRatios, overlapLengths, pbs, ecbs) {
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
			A[j][k] = C[j][k] = S[j][k] = P[j][k] = 0;
		}
	}
	var slopes = stems.map(function (s) { return (slopeOf(s.high) + slopeOf(s.low)) / 2; });
	for (var j = 0; j < n; j++) {
		for (var k = 0; k < j; k++) {
			// Overlap weight
			var ovr = overlapLengths[j][k];
			var isSideTouch = stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax
				|| stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax;
			// For side touches witn low overlap, drop it.
			if (ovr < strategy.SIDETOUCH_LIMIT && isSideTouch) { ovr = 0; }

			var slopesCoeff = !pbs[j][k] && stems[j].belongRadical === stems[k].belongRadical ? Math.max(0.25, 1 - Math.abs(slopes[j] - slopes[k]) * 20) : 1;

			var structuralPromixity = segmentsPromixity(stems[j].low, stems[k].high)
				+ segmentsPromixity(stems[j].high, stems[k].low)
				+ segmentsPromixity(stems[j].low, stems[k].low)
				+ segmentsPromixity(stems[j].high, stems[k].high);
			var spatialPromixity = structuralPromixity;

			// PBS
			if ((pbs[j][k] || ecbs[j][k] || atGlyphTop(stems[j], strategy) || atGlyphBottom(stems[k], strategy))
				&& spatialPromixity < strategy.COEFF_PBS_MIN_PROMIX) {
				spatialPromixity = strategy.COEFF_PBS_MIN_PROMIX;
			}
			if ((pbs[j][k] || ecbs[j][k]) && spatialPromixity < strategy.COEFF_PBS_MIN_PROMIX) {
				structuralPromixity = strategy.COEFF_PBS_MIN_PROMIX;
			}
			// ECBS : entire-contour-between-stems
			spatialPromixity *= (ecbs[j][k] + 1);
			structuralPromixity *= (ecbs[j][k] + 1);
			// Top/bottom
			if (atGlyphTop(stems[j], strategy) || atGlyphBottom(stems[k], strategy)) {
				spatialPromixity *= strategy.COEFF_STRICT_TOP_BOT_PROMIX
			} else if (!stems[j].hasGlyphStemAbove || !stems[k].hasGlyphStemBelow) {
				spatialPromixity *= strategy.COEFF_TOP_BOT_PROMIX
			}

			var promixityCoeff = (1 + (spatialPromixity > 2 ? strategy.COEFF_C_MULTIPLIER / strategy.COEFF_A_MULTIPLIER : 1) * spatialPromixity);
			// Alignment coefficients
			var coeffA = 1;
			if (pbs[j][k]) {
				// ECBS is not considered here
				coeffA = strategy.COEFF_A_FEATURE_LOSS;
			} else if (!stems[j].hasGlyphStemAbove || !stems[k].hasGlyphStemBelow) {
				if (stems[j].belongRadical === stems[k].belongRadical) {
					coeffA = strategy.COEFF_A_TOPBOT_MERGED_SR;
				} else {
					coeffA = strategy.COEFF_A_TOPBOT_MERGED;
				}
			} else if (stems[j].belongRadical === stems[k].belongRadical) {
				if (!stems[j].hasSameRadicalStemAbove || !stems[k].hasSameRadicalStemBelow) {
					coeffA = strategy.COEFF_A_SHAPE_LOST;
				} else {
					coeffA = strategy.COEFF_A_SAME_RADICAL;
				}
			} else if (
				(atRadicalBottom(stems[j], strategy) && atRadicalBottom(stems[k], strategy)
					|| atRadicalTop(stems[j], strategy) && atRadicalTop(stems[k], strategy))
				&& !(atRadicalBottom(stems[j], strategy) && atRadicalTop(stems[j], strategy))
				&& !(atRadicalBottom(stems[k], strategy) && atRadicalTop(stems[k], strategy))) {
				coeffA = strategy.COEFF_A_SHAPE_LOST_XR;
			} else if (atRadicalBottom(stems[j], strategy) && atRadicalTop(stems[k], strategy)) {
				coeffA = strategy.COEFF_A_RADICAL_MERGE;
			}

			// Collision coefficients
			var coeffC = 1;
			if (stems[j].belongRadical === stems[k].belongRadical) coeffC = strategy.COEFF_C_SAME_RADICAL;
			if (pbs[j][k]) coeffC *= strategy.COEFF_C_FEATURE_LOSS / 2;
			var symmetryCoeff = 1;
			if (Math.abs(stems[j].xmin - stems[k].xmin) <= strategy.BLUEZONE_WIDTH) {
				symmetryCoeff += 2;
			}
			if (Math.abs(stems[j].xmax - stems[k].xmax) <= strategy.BLUEZONE_WIDTH) {
				symmetryCoeff += 2;
			}

			A[j][k] = Math.round(strategy.COEFF_A_MULTIPLIER * ovr * coeffA * promixityCoeff * slopesCoeff);
			C[j][k] = Math.round(strategy.COEFF_C_MULTIPLIER * (1 + ovr * coeffC * slopesCoeff * symmetryCoeff) * promixityCoeff);
			S[j][k] = Math.round(strategy.COEFF_S);
			P[j][k] = Math.round(structuralPromixity + (pbs[j][k] ? 1 : 0));
		}
	}
	for (var j = 0; j < n; j++) {
		var isBottomMost = true;
		for (var k = 0; k < j; k++) { if (C[j][k] > 0) isBottomMost = false; }
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
		for (var k = j + 1; k < n; k++) { if (C[k][j] > 0) isTopMost = false; }
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
	};
};
