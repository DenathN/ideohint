"use strict";

let slopeOf = require("../types/").slopeOf;
let segmentsPromixity = require("./seg").segmentsPromixity;

function atRadicalTop(stem, strategy) {
	return (
		!stem.hasSameRadicalStemAbove &&
		!(stem.hasRadicalPointAbove && stem.radicalCenterRise > strategy.STEM_CENTER_MIN_RISE) &&
		!(
			stem.hasRadicalLeftAdjacentPointAbove &&
			stem.radicalLeftAdjacentRise > strategy.STEM_SIDE_MIN_RISE
		) &&
		!(
			stem.hasRadicalRightAdjacentPointAbove &&
			stem.radicalRightAdjacentRise > strategy.STEM_SIDE_MIN_RISE
		)
	);
}
function atRadicalBottom(stem, strategy) {
	return (
		!stem.hasSameRadicalStemBelow &&
		!(
			stem.hasRadicalPointBelow &&
			stem.radicalCenterDescent > strategy.STEM_CENTER_MIN_DESCENT
		) &&
		!(
			stem.hasRadicalLeftAdjacentPointBelow &&
			stem.radicalLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT
		) &&
		!(
			stem.hasRadicalRightAdjacentPointBelow &&
			stem.radicalRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT
		)
	);
}

function atGlyphTop(stem, strategy) {
	return (
		atRadicalTop(stem, strategy) &&
		!stem.hasGlyphStemAbove &&
		!(stem.hasGlyphPointAbove && stem.glyphCenterRise > strategy.STEM_CENTER_MIN_RISE) &&
		!(
			stem.hasGlyphLeftAdjacentPointAbove &&
			stem.glyphLeftAdjacentRise > strategy.STEM_SIDE_MIN_RISE
		) &&
		!(
			stem.hasGlyphRightAdjacentPointAbove &&
			stem.glyphRightAdjacentRise > strategy.STEM_SIDE_MIN_RISE
		)
	);
}
function atGlyphBottom(stem, strategy) {
	return (
		atRadicalBottom(stem, strategy) &&
		!stem.hasGlyphStemBelow &&
		!(stem.hasGlyphPointBelow && stem.glyphCenterDescent > strategy.STEM_CENTER_MIN_DESCENT) &&
		!(
			stem.hasGlyphLeftAdjacentPointBelow &&
			stem.glyphLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT
		) &&
		!(
			stem.hasGlyphRightAdjacentPointBelow &&
			stem.glyphRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT
		)
	);
}

module.exports = function calculateCollisionMatrices(
	strategy,
	stems,
	overlapRatios,
	overlapLengths,
	pbs,
	ecbs,
	turnMatrix
) {
	// A : Annexation operator
	// C : Collision operator
	// S : Swap operator
	let A = [],
		C = [],
		S = [],
		P = [],
		Q = [],
		n = stems.length;
	for (let j = 0; j < n; j++) {
		A[j] = [];
		C[j] = [];
		S[j] = [];
		P[j] = [];
		Q[j] = [];
		for (let k = 0; k < n; k++) {
			A[j][k] = C[j][k] = S[j][k] = P[j][k] = Q[j][k] = 0;
		}
	}
	let slopes = stems.map(function(s) {
		return (slopeOf(s.high) + slopeOf(s.low)) / 2;
	});
	for (let j = 0; j < n; j++) {
		const jrtop = atRadicalTop(stems[j], strategy);
		const jrbot = atRadicalBottom(stems[j], strategy);
		for (let k = 0; k < j; k++) {
			const krtop = atRadicalTop(stems[k], strategy);
			const krbot = atRadicalBottom(stems[k], strategy);
			// Overlap weight
			let ovr = overlapLengths[j][k];
			let strong = overlapRatios[j][k] > 0.85 || overlapRatios[k][j] > 0.85 || ovr > 1 / 3;
			let isSideTouch =
				(stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax) ||
				(stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax);
			// For side touches witn low overlap, drop it.
			if (ovr < strategy.SIDETOUCH_LIMIT && isSideTouch) {
				ovr = 0;
			}

			let slopesCoeff =
				!pbs[j][k] && stems[j].belongRadical !== stems[k].belongRadical
					? Math.max(0.25, 1 - Math.abs(slopes[j] - slopes[k]) * 10)
					: 1;

			let structuralPromixity =
				segmentsPromixity(stems[j].low, stems[k].high) +
				segmentsPromixity(stems[j].high, stems[k].low) +
				segmentsPromixity(stems[j].low, stems[k].low) +
				segmentsPromixity(stems[j].high, stems[k].high);
			let spatialPromixity = structuralPromixity;

			// PBS
			if (
				(pbs[j][k] ||
					ecbs[j][k] ||
					!stems[j].hasGlyphStemAbove ||
					!stems[k].hasGlyphStemBelow) &&
				spatialPromixity < strategy.COEFF_PBS_MIN_PROMIX
			) {
				spatialPromixity = strategy.COEFF_PBS_MIN_PROMIX;
			}
			if ((pbs[j][k] || ecbs[j][k]) && spatialPromixity < strategy.COEFF_PBS_MIN_PROMIX) {
				structuralPromixity = strategy.COEFF_PBS_MIN_PROMIX;
			}
			// ECBS : entire-contour-between-stems
			spatialPromixity *= ecbs[j][k] + 1;
			structuralPromixity *= ecbs[j][k] + 1;
			// Top/bottom
			if (
				(atGlyphTop(stems[j], strategy) && !stems[j].diagLow) ||
				(atGlyphBottom(stems[k], strategy) && !stems[j].diagHigh)
			) {
				spatialPromixity *= strategy.COEFF_STRICT_TOP_BOT_PROMIX;
			} else if (!stems[j].hasGlyphStemAbove || !stems[k].hasGlyphStemBelow) {
				spatialPromixity *= strategy.COEFF_TOP_BOT_PROMIX;
			}

			let promixityCoeff = 1 + (spatialPromixity > 2 ? 5 : 1) * spatialPromixity;
			// Annexation coefficients
			let coeffA = 1;
			if (pbs[j][k]) {
				// There are something in between!
				// ECBS is not considered here
				coeffA *= strategy.COEFF_A_FEATURE_LOSS;
			}
			if (turnMatrix[j][k] > 1) {
				coeffA *= strategy.COEFF_A_SHAPE_LOST_XX;
			}
			if (!stems[j].hasGlyphStemAbove || !stems[k].hasGlyphStemBelow) {
				if (stems[j].belongRadical === stems[k].belongRadical) {
					coeffA *= strategy.COEFF_A_TOPBOT_MERGED_SR;
				} else {
					coeffA *= strategy.COEFF_A_TOPBOT_MERGED;
				}
				if (
					(!stems[j].hasGlyphStemAbove && !atRadicalBottom(stems[j], strategy)) ||
					(!stems[k].hasGlyphStemBelow && !atRadicalTop(stems[k], strategy))
				) {
					coeffA *= strategy.COEFF_A_SHAPE_LOST_XX;
				}
			}
			if (stems[j].belongRadical === stems[k].belongRadical) {
				coeffA *= strategy.COEFF_A_SAME_RADICAL;
				if (!stems[j].hasSameRadicalStemAbove && !stems[k].hasSameRadicalStemBelow) {
					coeffA *= strategy.COEFF_A_SHAPE_LOST_XX;
				} else if (!stems[j].hasSameRadicalStemAbove || !stems[k].hasSameRadicalStemBelow) {
					coeffA *= strategy.COEFF_A_SHAPE_LOST;
				}
			} else if (jrbot && krtop) {
				coeffA *= strategy.COEFF_A_RADICAL_MERGE;
			} else if (jrbot || krtop) {
				coeffA *= strategy.COEFF_A_SHAPE_LOST_XR;
			}

			// Collision coefficients
			let coeffC = 1;
			if (stems[j].belongRadical === stems[k].belongRadical && strong) {
				coeffC *= strategy.COEFF_C_SAME_RADICAL;
			}
			if (
				!stems[j].hasSameRadicalStemAbove &&
				!stems[k].hasSameRadicalStemBelow &&
				ecbs[j][k]
			) {
				coeffC *= strategy.COEFF_C_SHAPE_LOST_XX;
			}
			if (pbs[j][k]) {
				// There are something in between!
				coeffC *= strategy.COEFF_C_FEATURE_LOSS / 2;
			}
			if (turnMatrix[j][k] > 1) {
				coeffC *= strategy.COEFF_C_SHAPE_LOST_XX;
			}
			if (strong && (!stems[j].hasGlyphStemAbove || !stems[k].hasGlyphStemBelow)) {
				coeffC *= strategy.COEFF_C_SHAPE_LOST_XX * Math.pow(ovr, 3);
			}
			let symmetryCoeff = 1;
			if (Math.abs(stems[j].xmin - stems[k].xmin) <= strategy.BLUEZONE_WIDTH) {
				symmetryCoeff += 2;
			}
			if (Math.abs(stems[j].xmax - stems[k].xmax) <= strategy.BLUEZONE_WIDTH) {
				symmetryCoeff += 2;
			}

			A[j][k] = Math.ceil(
				strategy.COEFF_A_MULTIPLIER * ovr * coeffA * promixityCoeff * slopesCoeff
			);
			if (!isFinite(A[j][k])) A[j][k] = 0;
			C[j][k] = Math.round(
				strategy.COEFF_C_MULTIPLIER *
					Math.pow(ovr, 2) *
					coeffC *
					symmetryCoeff *
					slopesCoeff
			);
			if (!ovr) C[j][k] = 0;
			if (stems[j].rid && stems[j].rid === stems[k].rid) {
				C[j][k] = 0;
			}
			S[j][k] = Math.round(strategy.COEFF_S);
			P[j][k] = Math.round(structuralPromixity + (pbs[j][k] ? 1 : 0));
			Q[j][k] = spatialPromixity;
		}
	}
	for (let j = 0; j < n; j++) {
		let isBottomMost = true;
		for (let k = 0; k < j; k++) {
			if (C[j][k] > 0) isBottomMost = false;
		}
		if (!isBottomMost) continue;
		for (let k = j + 1; k < n; k++) {
			const isSideTouch =
				(stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax) ||
				(stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax);
			const mindiff = Math.abs(stems[j].xmax - stems[k].xmin);
			const maxdiff = Math.abs(stems[j].xmin - stems[k].xmax);
			const unbalance =
				mindiff + maxdiff <= 0 ? 0 : Math.abs(mindiff - maxdiff) / (mindiff + maxdiff);
			if (!isSideTouch && unbalance >= strategy.TBST_LIMIT)
				A[k][j] *= strategy.COEFF_A_FEATURE_LOSS;
		}
	}
	for (let j = 0; j < n; j++) {
		let isTopMost = true;
		for (let k = j + 1; k < n; k++) {
			if (C[k][j] > 0) isTopMost = false;
		}
		if (!isTopMost) continue;
		for (let k = 0; k < j; k++) {
			const isSideTouch =
				(stems[j].xmin < stems[k].xmin && stems[j].xmax < stems[k].xmax) ||
				(stems[j].xmin > stems[k].xmin && stems[j].xmax > stems[k].xmax);
			const mindiff = Math.abs(stems[j].xmax - stems[k].xmin);
			const maxdiff = Math.abs(stems[j].xmin - stems[k].xmax);
			const unbalance =
				mindiff + maxdiff <= 0 ? 0 : Math.abs(mindiff - maxdiff) / (mindiff + maxdiff);
			if (!isSideTouch && unbalance >= strategy.TBST_LIMIT)
				A[j][k] *= strategy.COEFF_A_FEATURE_LOSS;
		}
	}
	for (let j = 0; j < n; j++) {
		for (let k = j + 1; k < n; k++) {
			A[j][k] = A[k][j] = Math.min(Math.max(A[j][k], A[k][j]), 1e9);
			C[j][k] = C[k][j] = Math.min(Math.max(C[j][k], C[k][j]), 1e9);
		}
	}
	return {
		annexation: A,
		collision: C,
		promixity: P,
		spatialPromixity: Q,
		swap: S
	};
};
