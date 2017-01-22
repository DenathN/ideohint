"use strict";
var minmaxOfSeg = require("./seg").minmaxOfSeg;

function analyzeRadicalPointsToStemRelationships(radical, stem, sameRadical, strategy) {
	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;
	var a0 = stem.low[0][0].xori, az = stem.low[stem.low.length - 1][stem.low[stem.low.length - 1].length - 1].xori;
	var b0 = stem.high[0][0].xori, bz = stem.high[stem.high.length - 1][stem.high[stem.high.length - 1].length - 1].xori;
	var xmin = Math.min(a0, b0, az, bz), xmax = Math.max(a0, b0, az, bz);
	var radicalParts = [radical.outline].concat(radical.holes);
	for (var j = 0; j < radicalParts.length; j++) for (var k = 0; k < radicalParts[j].points.length - 1; k++) {
			var point = radicalParts[j].points[k];
			if (point.yori > stem.yori && point.xori < xmax - blueFuzz && point.xori > xmin + blueFuzz) {
				stem.hasGlyphPointAbove = true;
				stem.glyphCenterRise = Math.max(stem.glyphCenterRise || 0, point.yori - stem.yori);
				if (sameRadical) {
					stem.hasRadicalPointAbove = true;
					stem.radicalCenterRise = Math.max(stem.radicalCenterRise || 0, point.yori - stem.yori);
				}
			}
			if (point.yori > stem.yori && point.xori >= xmax - blueFuzz && point.xori <= xmax + blueFuzz) {
				stem.hasGlyphRightAdjacentPointAbove = true;
				stem.glyphRightAdjacentRise = Math.max(stem.glyphRightAdjacentRise || 0, point.yori - stem.yori);
				if (sameRadical) {
					stem.hasRadicalRightAdjacentPointAbove = true;
					stem.radicalRightAdjacentRise = Math.max(stem.radicalRightAdjacentRise || 0, point.yori - stem.yori);
				}
			}
			if (point.yori > stem.yori && point.xori <= xmin + blueFuzz && point.xori >= xmin - blueFuzz) {
				stem.hasGlyphLeftAdjacentPointAbove = true;
				stem.glyphLeftAdjacentRise = Math.max(stem.glyphLeftAdjacentRise || 0, point.yori - stem.yori);
				if (sameRadical) {
					stem.hasRadicalLeftAdjacentPointAbove = true;
					stem.radicalLeftAdjacentRise = Math.max(stem.radicalLeftAdjacentRise || 0, point.yori - stem.yori);
				}
			}
			if (point.yori > stem.yori && point.xori >= xmax + blueFuzz) {
				stem.hasGlyphRightDistancedPointAbove = true;
				stem.glyphRightDistancedRise = Math.max(stem.glyphRightDistancedRise || 0, point.yori - stem.yori);
				if (sameRadical) {
					stem.hasRadicalRightDistancedPointAbove = true;
					stem.radicalRightDistancedRise = Math.max(stem.radicalRightDistancedRise || 0, point.yori - stem.yori);
				}
			}
			if (point.yori > stem.yori && point.xori <= xmin - blueFuzz) {
				stem.hasGlyphLeftDistancedPointAbove = true;
				stem.glyphLeftDistancedRise = Math.max(stem.glyphLeftDistancedRise || 0, point.yori - stem.yori);
				if (sameRadical) {
					stem.hasRadicalLeftDistancedPointAbove = true;
					stem.radicalLeftDistancedRise = Math.max(stem.radicalLeftDistancedRise || 0, point.yori - stem.yori);
				}
			}
			if (point.yori < stem.yori - stem.width && point.xori < xmax - blueFuzz && point.xori > xmin + blueFuzz) {
				stem.hasGlyphPointBelow = true;
				stem.glyphCenterDescent = Math.max(stem.glyphCenterDescent || 0, stem.yori - stem.width - point.yori);
				if (sameRadical) {
					stem.hasRadicalPointBelow = true;
					stem.radicalCenterDescent = Math.max(stem.radicalCenterDescent || 0, stem.yori - stem.width - point.yori);
				}
				if (point.yStrongExtrema) {
					stem.hasGlyphVFoldBelow = true;
					if (sameRadical) { stem.hasRadicalVFoldBelow = true; }
				}
			}
			if (point.xStrongExtrema && !(point.yExtrema && !point.yStrongExtrema) && point.yori < stem.yori - stem.width - blueFuzz && point.xori < xmax + stem.width && point.xori > xmin - stem.width) {
				if (!point.atleft && point.xori > xmin + (xmax - xmin) * 0.2 || point.atleft && point.xori < xmax - (xmax - xmin) * 0.2) {
					stem.hasGlyphFoldBelow = true;
					if (sameRadical) { stem.hasRadicalFoldBelow = true; }
				} else if (point.xori < xmax - (xmax - xmin) * 0.2 && point.xori > xmin + (xmax - xmin) * 0.2) {
					stem.hasGlyphSideFoldBelow = true;
					if (sameRadical) { stem.hasRadicalSideFoldBelow = true; }
				}
			}
			if (point.yori < stem.yori - stem.width && point.xori >= xmax - blueFuzz && point.xori <= xmax + blueFuzz) {
				stem.hasGlyphRightAdjacentPointBelow = true;
				stem.glyphRightAdjacentDescent = Math.max(stem.glyphRightAdjacentDescent || 0, stem.yori - stem.width - point.yori);
				if (sameRadical) {
					stem.hasRadicalRightAdjacentPointBelow = true;
					stem.radicalRightAdjacentDescent = Math.max(stem.radicalRightAdjacentDescent || 0, stem.yori - stem.width - point.yori);
				}
			}
			if (point.yori < stem.yori - stem.width && point.xori <= xmin + blueFuzz && point.xori >= xmin - blueFuzz) {
				stem.hasGlyphLeftAdjacentPointBelow = true;
				stem.glyphLeftAdjacentDescent = Math.max(stem.glyphLeftAdjacentDescent || 0, stem.yori - stem.width - point.yori);
				if (sameRadical) {
					stem.hasRadicalLeftAdjacentPointBelow = true;
					stem.radicalLeftAdjacentDescent = Math.max(stem.radicalLeftAdjacentDescent || 0, stem.yori - stem.width - point.yori);
				}
			}
			if (point.yori < stem.yori - stem.width && point.xori >= xmax + blueFuzz) {
				stem.hasGlyphRightDistancedPointBelow = true;
				stem.glyphRightDistancedDescent = Math.max(stem.glyphRightDistancedDescent || 0, stem.yori - stem.width - point.yori);
				if (sameRadical) {
					stem.hasRadicalRightDistancedPointBelow = true;
					stem.radicalRightDistancedDescent = Math.max(stem.radicalRightDistancedDescent || 0, stem.yori - stem.width - point.yori);
				}
			}
			if (point.yori < stem.yori - stem.width && point.xori <= xmin - blueFuzz) {
				stem.hasGlyphLeftDistancedPointBelow = true;
				stem.glyphLeftDistancedDescent = Math.max(stem.glyphLeftDistancedDescent || 0, stem.yori - stem.width - point.yori);
				if (sameRadical) {
					stem.hasRadicalLeftDistancedPointBelow = true;
					stem.radicalLeftDistancedDescent = Math.max(stem.radicalLeftDistancedDescent || 0, stem.yori - stem.width - point.yori);
				}
			}
	}
}

function analyzePointToStemSpatialRelationships(stem, radicals, strategy) {
	var rHigh = minmaxOfSeg(stem.high);
	var rLow = minmaxOfSeg(stem.low);
	var xmin = Math.min(rHigh.min, rLow.min), xmax = Math.max(rHigh.max, rLow.max);
	for (var rad = 0; rad < radicals.length; rad++) {
		var radical = radicals[rad];
		var sameRadical = (radical === radicals[stem.belongRadical]);
		analyzeRadicalPointsToStemRelationships(radical, stem, sameRadical, strategy);
	}
	stem.xmin = xmin;
	stem.xmax = xmax;
}

exports.analyzeStemSpatialRelationships = function (stems, radicals, overlaps, strategy) {
	for (var k = 0; k < stems.length; k++) {
		analyzePointToStemSpatialRelationships(stems[k], radicals, strategy);
		for (var j = 0; j < stems.length; j++) {
			if (overlaps[j][k] > strategy.COLLISION_MIN_OVERLAP_RATIO && stems[j].yori > stems[k].yori) {
				stems[k].hasGlyphStemAbove = true;
				stems[j].hasGlyphStemBelow = true;
				if (stems[j].belongRadical === stems[k].belongRadical) {
					stems[j].hasSameRadicalStemBelow = true;
					stems[k].hasSameRadicalStemAbove = true;
				}
			}
		}
	}
};

function analyzePBS(u, v, radical, strategy) {
	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;
	var radicalParts = [radical.outline].concat(radical.holes);
	var ans = 0;
	for (var j = 0; j < radicalParts.length; j++) for (var k = 0; k < radicalParts[j].points.length - 1; k++) {
			var point = radicalParts[j].points[k];
			if ((!u.hasGlyphPointAbove || !v.hasGlyphPointBelow || point.xExtrema || point.yExtrema) && point.yori > v.yori + blueFuzz && point.yori < u.yori - u.width - blueFuzz
				&& point.xori > v.xmin + blueFuzz && point.xori < v.xmax - blueFuzz
				&& point.xori > u.xmin + blueFuzz && point.xori < u.xmax - blueFuzz) {
				if (ans < 1) ans = 1;
				if (point.xStrongExtrema && ans < 2) { ans = 2; }
			}
	}
	return ans;
}

exports.analyzePointBetweenStems = function (stems, radicals, strategy) {
	var res = [];
	for (var sj = 0; sj < stems.length; sj++) {
		res[sj] = [];
		for (var sk = 0; sk < sj; sk++) {
			res[sj][sk] = 0;
			for (var rad = 0; rad < radicals.length; rad++) {
				res[sj][sk] += analyzePBS(stems[sj], stems[sk], radicals[rad], strategy);
			}
		}
	}
	return res;
};

exports.analyzeEntireContorBetweenStems = function (glyph, stems) {
	var ans = [];
	for (var j = 0; j < stems.length; j++) {
		ans[j] = [];
		for (var k = 0; k < stems.length; k++) {
			ans[j][k] = 0;
			if (!(stems[j].yori > stems[k].yori))continue;
			for (var c = 0; c < glyph.contours.length; c++) {
				var cr = glyph.contours[c];
				var sj = stems[j];
				var sk = stems[k];
				if (cr.xmin >= sj.xmin && cr.xmax <= sj.xmax
					&& cr.xmin >= sk.xmin && cr.xmax <= sk.xmax
					&& cr.ymax <= sj.yori && cr.ymin >= sk.yori) {
					ans[j][k] += 1;
				}
			}
		}
	}
	return ans;
};
