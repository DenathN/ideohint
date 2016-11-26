"use strict";

var util = require("util");
var roundings = require("../roundings");
var toposort = require("toposort");

var evolve = require("./evolve");
var Individual = require("./individual");
var uncollide = require("./uncollide");
var balance = require("./balance");
var earlyAdjust = require("./early");
var allocateWidth = require("./allocate-width");
var stemPositionToActions = require("./actions");

function xclamp (low, x, high) { return x < low ? low : x > high ? high : x; }
function lerp (x, x1, x2, y1, y2) {
	return (x - x1) / (x2 - x1) * (y2 - y1) + y1;
}

function xlerp (x, x1, x2, x3, y1, y2, y3) {
	if (x <= x2) {
		return (x - x1) / (x2 - x1) * (y2 - y1) + y1;
	} else {
		return (x - x2) / (x3 - x2) * (y3 - y2) + y2;
	}
}

function hint (glyph, ppem, strategy) {
	var stems = glyph.stems;
	if (!stems.length) return [];

	var upm = strategy.UPM || 1000;
	var uppx = upm / ppem;
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DIST_RISE = strategy.STEM_SIDE_MIN_DIST_RISE;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT;
	var STEM_SIDE_MIN_DIST_DESCENT = strategy.STEM_SIDE_MIN_DIST_DESCENT;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT;

	var PPEM_INCREASE_GLYPH_LIMIT = strategy.PPEM_INCREASE_GLYPH_LIMIT;

	var CANONICAL_STEM_WIDTH = (ppem <= PPEM_INCREASE_GLYPH_LIMIT
		? strategy.CANONICAL_STEM_WIDTH_SMALL
		: strategy.CANONICAL_STEM_WIDTH +
		lerp(ppem, PPEM_INCREASE_GLYPH_LIMIT, strategy.PPEM_MAX,
			0, strategy.CANONICAL_STEM_WIDTH_LARGE_ADJ));
	var CANONICAL_STEM_WIDTH_DENSE = strategy.CANONICAL_STEM_WIDTH_DENSE;
	if (ppem > PPEM_INCREASE_GLYPH_LIMIT) {
		CANONICAL_STEM_WIDTH_DENSE += lerp(ppem, PPEM_INCREASE_GLYPH_LIMIT, strategy.PPEM_MAX,
			0, strategy.CANONICAL_STEM_WIDTH_LARGE_ADJ);
	}

	var WIDTH_GEAR_PROPER = Math.round(CANONICAL_STEM_WIDTH / uppx);
	var WIDTH_GEAR_MIN = Math.round(CANONICAL_STEM_WIDTH_DENSE / uppx);
	if (WIDTH_GEAR_MIN > WIDTH_GEAR_PROPER) WIDTH_GEAR_MIN = WIDTH_GEAR_PROPER;

	var ABLATION_IN_RADICAL = strategy.ABLATION_IN_RADICAL;
	var ABLATION_RADICAL_EDGE = strategy.ABLATION_RADICAL_EDGE;
	var ABLATION_GLYPH_EDGE = strategy.ABLATION_GLYPH_EDGE;
	var ABLATION_GLYPH_HARD_EDGE = strategy.ABLATION_GLYPH_HARD_EDGE;

	var COEFF_PORPORTION_DISTORTION = strategy.COEFF_PORPORTION_DISTORTION;

	var BLUEZONE_BOTTOM_CENTER = strategy.BLUEZONE_BOTTOM_CENTER;
	var BLUEZONE_BOTTOM_BAR_REF = strategy.BLUEZONE_BOTTOM_BAR_REF;
	var BLUEZONE_BOTTOM_BAR = xlerp(ppem,
		strategy.PPEM_MIN, strategy.BLUEZONE_BOTTOM_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
		strategy.BLUEZONE_BOTTOM_BAR_SMALL, strategy.BLUEZONE_BOTTOM_BAR_MIDDLE, strategy.BLUEZONE_BOTTOM_BAR_LARGE);
	var BLUEZONE_BOTTOM_DOTBAR = xlerp(ppem,
		strategy.PPEM_MIN, strategy.BLUEZONE_BOTTOM_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
		strategy.BLUEZONE_BOTTOM_DOTBAR_SMALL, strategy.BLUEZONE_BOTTOM_DOTBAR_MIDDLE, strategy.BLUEZONE_BOTTOM_DOTBAR_LARGE);

	var BLUEZONE_TOP_CENTER = strategy.BLUEZONE_TOP_CENTER;
	var BLUEZONE_TOP_BAR_REF = strategy.BLUEZONE_TOP_BAR_REF;
	var BLUEZONE_TOP_DOTBAR = xlerp(ppem,
		strategy.PPEM_MIN, strategy.BLUEZONE_TOP_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
		strategy.BLUEZONE_TOP_DOTBAR_SMALL, strategy.BLUEZONE_TOP_DOTBAR_MIDDLE, strategy.BLUEZONE_TOP_DOTBAR_LARGE);
	var BLUEZONE_TOP_BAR = xlerp(ppem,
		strategy.PPEM_MIN, strategy.BLUEZONE_TOP_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
		strategy.BLUEZONE_TOP_BAR_SMALL, strategy.BLUEZONE_TOP_BAR_MIDDLE, strategy.BLUEZONE_TOP_BAR_LARGE);

	var round = roundings.Rtg(upm, ppem);
	var roundDown = roundings.Rdtg(upm, ppem);
	var roundUp = roundings.Rutg(upm, ppem);


	var glyphBottom = round(BLUEZONE_BOTTOM_CENTER);
	var oPixelTop = round(BLUEZONE_TOP_CENTER);
	var glyphTop = glyphBottom + round(BLUEZONE_TOP_CENTER - BLUEZONE_BOTTOM_CENTER);

	function atRadicalTop (stem) {
		return !stem.hasSameRadicalStemAbove
		&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
		&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
		&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
		&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > STEM_SIDE_MIN_DIST_RISE)
		&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > STEM_SIDE_MIN_DIST_RISE);
	}
	function atGlyphTop (stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
		&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > STEM_CENTER_MIN_RISE)
		&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > STEM_SIDE_MIN_RISE)
		&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > STEM_SIDE_MIN_RISE);
	}
	function atRadicalBottom (stem) {
		return !stem.hasSameRadicalStemBelow
		&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
		&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
		&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
		&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT)
		&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT);
	}
	function atGlyphBottom (stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
		&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > STEM_CENTER_MIN_DESCENT)
		&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
		&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > STEM_SIDE_MIN_DESCENT);
	}

	var directOverlaps = glyph.directOverlaps;
	var overlaps = glyph.overlaps;
	var triplets = glyph.triplets;
	var flexes = glyph.flexes;

	var cyb = glyphBottom
	+ (round(BLUEZONE_BOTTOM_DOTBAR - BLUEZONE_BOTTOM_CENTER));
	var cyt = glyphTop
	- (round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR));
	var cybx = glyphBottom
	+ (round(BLUEZONE_BOTTOM_BAR - BLUEZONE_BOTTOM_CENTER))
	+ Math.min(0, glyphBottom - BLUEZONE_BOTTOM_BAR);
	var cytx = glyphTop
	- (round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR))
	+ Math.max(0, oPixelTop - BLUEZONE_TOP_BAR);

	function cy (y, w0, w, x) {
		// x means this stroke is topmost or bottommost
		var p = (y - w0 - BLUEZONE_BOTTOM_BAR_REF) / (BLUEZONE_TOP_BAR_REF - BLUEZONE_BOTTOM_BAR_REF - w0);
		if (x) {
			return w + cybx + (cytx - cybx - w) * p;
		} else {
			return w + cyb + (cyt - cyb - w) * p;
		}
	}
	function flexMiddleStem (t, m, b) {
		var spaceAboveOri = t.y0 - t.w0 / 2 - m.y0 + m.w0 / 2;
		var spaceBelowOri = m.y0 - m.w0 / 2 - b.y0 + b.w0 / 2;
		if (spaceAboveOri + spaceBelowOri > 0) {
			var totalSpaceFlexed = t.center - t.properWidth / 2 - b.center + b.properWidth / 2;
			var y = m.properWidth / 2 + b.center - b.properWidth / 2 + totalSpaceFlexed * (spaceBelowOri / (spaceBelowOri + spaceAboveOri));
			m.center = xclamp(m.low, y, m.high);
		}
	}

	function flexCenter (avaliables) {
		// fix top and bottom stems
		for (var j = 0; j < stems.length; j++) {
			if (!stems[j].hasGlyphStemBelow) {
				avaliables[j].high = Math.round(Math.max(
					avaliables[j].center,
					glyphBottom / uppx + avaliables[j].properWidth + (atGlyphBottom(stems[j]) ? 0 : 1
					)));
			}
			if (!stems[j].hasGlyphStemAbove) {
				avaliables[j].low = Math.round(avaliables[j].center);
			}
			if (ppem > PPEM_INCREASE_GLYPH_LIMIT && avaliables[j].properWidth < 3 && atGlyphBottom(stems[j]) && avaliables[j].high - avaliables[j].low <= 1 && avaliables[j].low <= glyphBottom / uppx + avaliables[j].properWidth + 0.1) {
				// Lock the bottommost stroke
				avaliables[j].high = avaliables[j].low;
			}
		}
		for (var j = 0; j < flexes.length; j++) {
			flexMiddleStem(avaliables[flexes[j][0]], avaliables[flexes[j][1]], avaliables[flexes[j][2]]);
		}
	}

	function calculateWidth (w, coordinate) {
		if (coordinate) {
			var pixels = w / CANONICAL_STEM_WIDTH * WIDTH_GEAR_PROPER;
		} else {
			var pixels = w / uppx;
		}

		if (pixels > WIDTH_GEAR_PROPER) pixels = WIDTH_GEAR_PROPER;
		if (pixels < WIDTH_GEAR_MIN) {
			if (WIDTH_GEAR_MIN < 3) {
				pixels = WIDTH_GEAR_MIN;
			} else if (pixels < WIDTH_GEAR_MIN - 0.8 && WIDTH_GEAR_MIN === WIDTH_GEAR_PROPER) {
				pixels = WIDTH_GEAR_MIN - 1;
			} else {
				pixels = WIDTH_GEAR_MIN;
			}
		}
		return Math.round(pixels);
	}

	function decideWidths (stems, priority, tws) {
		var tws = [];
		var areaLost = 0;
		var totalWidth = 0;
		for (var j = 0; j < stems.length; j++) {
			tws[j] = calculateWidth(stems[j].width, true);
			totalWidth += stems[j].width;
			areaLost += (stems[j].width / uppx - tws[j]) * (stems[j].xmax - stems[j].xmin);
		}
		// Coordinate widths
		var averageWidth = totalWidth / stems.length;
		var coordinateWidth = calculateWidth(averageWidth, true);
		if (areaLost > 0) {
			var areaLostDecreased = true;
			var passes = 0;
			while (areaLostDecreased && areaLost > 0 && passes < 100) {
				// We will try to increase stroke width if we detected that some pixels are lost.
				areaLostDecreased = false;
				passes += 1;
				for (var m = 0; m < priority.length; m++) {
					var j = priority[m];
					var len = stems[j].xmax - stems[j].xmin;
					if (tws[j] < WIDTH_GEAR_PROPER && areaLost > len / 2) {
						tws[j] += 1;
						areaLost -= len;
						areaLostDecreased = true;
						break;
					}
				}
			}
		} else {
			var areaLostDecreased = true;
			var passes = 0;
			while (areaLostDecreased && areaLost < 0 && passes < 100) {
				// We will try to increase stroke width if we detected that some pixels are lost.
				areaLostDecreased = false;
				passes += 1;
				for (var m = priority.length - 1; m >= 0; m--) {
					var j = priority[m];
					var len = stems[j].xmax - stems[j].xmin;
					if (tws[j] > coordinateWidth && areaLost < -len / 2) {
						areaLost += len;
						tws[j] -= 1;
						areaLostDecreased = true;
						break;
					}
				}
			}
		}
		return tws;
	}

	// The "avaliability" table records the parameters used when placing stems, including:
	// - the posotion limit.
	// - the stem's proper width (in pixels).
	// - key spatial relationships.
	var avaliables = function (stems) {
		var avaliables = [];
		var tws = decideWidths(stems, glyph.dominancePriority);
		// Decide avaliability space
		for (var j = 0; j < stems.length; j++) {
			var y0 = stems[j].yori, w0 = stems[j].width;
			var w = tws[j] * uppx;
			// The bottom limit of a stem
			var lowlimit = atGlyphBottom(stems[j])
				? glyphBottom + w : glyphBottom + w + uppx;
			var fold = false;
			// Add additional space below strokes with a fold under it.
			if (stems[j].hasGlyphFoldBelow && !stems[j].hasGlyphStemBelow) {
				lowlimit = Math.max(glyphBottom + Math.max(2, WIDTH_GEAR_PROPER + 1) * uppx + w, lowlimit);
				fold = true;
			} else if (stems[j].hasGlyphSideFoldBelow && !stems[j].hasGlyphStemBelow) {
				lowlimit = Math.max(glyphBottom + Math.max(WIDTH_GEAR_PROPER + 2, WIDTH_GEAR_PROPER * 2) * uppx, lowlimit);
				fold = true;
			}

			// The top limit of a stem ('s upper edge)
			var highlimit = glyphTop - xclamp(
				atGlyphTop(stems[j]) ? 0 : uppx, // essential space above
				atGlyphTop(stems[j])
					? (
					y0 > BLUEZONE_TOP_BAR && ppem <= PPEM_INCREASE_GLYPH_LIMIT
						? round(BLUEZONE_TOP_CENTER - y0)
						: round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR) + roundDown(BLUEZONE_TOP_BAR - y0))
					: (
					y0 > BLUEZONE_TOP_DOTBAR && ppem <= PPEM_INCREASE_GLYPH_LIMIT
						? round(BLUEZONE_TOP_CENTER - y0)
						: Math.max(
							round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR),
							roundDown(BLUEZONE_TOP_BAR - y0)
						)),
				WIDTH_GEAR_MIN * uppx);

			var looseRoundingLow = ppem > PPEM_INCREASE_GLYPH_LIMIT && !(stems[j].hasGlyphFoldBelow && !stems[j].hasGlyphStemBelow || stems[j].hasGlyphSideFoldBelow && !stems[j].hasGlyphStemBelow);
			var looseRoundingHigh = ppem > PPEM_INCREASE_GLYPH_LIMIT;

			var center0 = cy(y0, w0, w, atGlyphTop(stems[j]) || atGlyphBottom(stems[j]));
			var low = xclamp(lowlimit, round(center0) - uppx, highlimit);
			var high = xclamp(lowlimit, round(center0) + uppx, highlimit);

			var lowlimitW = tws[j] > 1 ? lowlimit - uppx : lowlimit;

			var lowW = xclamp(lowlimitW, looseRoundingLow ? round(center0 - 2 * uppx) : round(center0) - uppx, highlimit);
			var highW = xclamp(lowlimitW, looseRoundingHigh ? round(center0 + 2 * uppx) : round(center0) + uppx, highlimit);
			var center = xclamp(low, center0, high);

			var ablationCoeff = atGlyphTop(stems[j]) || atGlyphBottom(stems[j]) ? ABLATION_GLYPH_HARD_EDGE
				: !stems[j].hasGlyphStemAbove || !stems[j].hasGlyphStemBelow ? ABLATION_GLYPH_EDGE
					: !stems[j].hasSameRadicalStemAbove || !stems[j].hasSameRadicalStemBelow ? ABLATION_RADICAL_EDGE : ABLATION_IN_RADICAL;
			avaliables[j] = {
				// limit of the stroke's y, when positioning, in pixels
				low: Math.round(low / uppx),
				high: Math.round(high / uppx),
				// limit of the stroke's y, when width allocating, in pixels
				lowW: Math.round(lowW / uppx),
				highW: Math.round(highW / uppx),
				// its proper width, in pixels
				properWidth: tws[j],
				// its proper position, in pixels
				center: center / uppx,
				ablationCoeff: ablationCoeff / uppx * (1 + 0.5 * (stems[j].xmax - stems[j].xmin) / upm),
				// original position and width
				y0: y0,
				w0: w0,
				xmin: stems[j].xmin,
				xmax: stems[j].xmax,
				length: stems[j].xmax - stems[j].xmin,
				// spatial relationships
				atGlyphTop: atGlyphTop(stems[j]),
				atGlyphBottom: atGlyphBottom(stems[j]),
				hasGlyphStemAbove: stems[j].hasGlyphStemAbove,
				hasGlyphStemBelow: stems[j].hasGlyphStemBelow,
				hasFoldBelow: fold,
				posKeyAtTop: stems[j].posKeyAtTop
			};
		}
		flexCenter(avaliables);
		for (var j = 0; j < stems.length; j++) {
			avaliables[j].proportion = (avaliables[j].center - avaliables[0].center) / (avaliables[avaliables.length - 1].center - avaliables[0].center) || 0;
		}
		return avaliables;
	}(stems);

	var env = {
		// ACSP matrices
		A: glyph.collisionMatrices.alignment,
		C: glyph.collisionMatrices.collision,
		S: glyph.collisionMatrices.swap,
		P: glyph.collisionMatrices.promixity,
		// symmetry matrix
		symmetry: (function () {
			var sym = [];
			for (var j = 0; j < avaliables.length; j++) {
				sym[j] = [];
				for (var k = 0; k < j; k++) {
					sym[j][k] = !directOverlaps[j][k]
						&& Math.abs(avaliables[j].y0 - avaliables[k].y0) < uppx / 3
						&& Math.abs(avaliables[j].y0 - avaliables[j].w0 - avaliables[k].y0 + avaliables[k].w0) < uppx / 3
						&& Math.abs(avaliables[j].length - avaliables[k].length) < uppx / 3
						&& (stems[j].hasGlyphStemAbove === stems[k].hasGlyphStemAbove)
						&& (stems[j].hasGlyphStemBelow === stems[k].hasGlyphStemBelow)
						&& (stems[j].hasSameRadicalStemAbove === stems[k].hasSameRadicalStemAbove)
						&& (stems[j].hasSameRadicalStemBelow === stems[k].hasSameRadicalStemBelow)
						&& (avaliables[j].atGlyphTop === avaliables[k].atGlyphTop)
						&& (avaliables[j].atGlyphBottom === avaliables[k].atGlyphBottom);
				}
			}
			return sym;
		})(),
		// overlap matrices
		directOverlaps: directOverlaps,
		strictOverlaps: glyph.strictOverlaps,
		// recorded triplets
		triplets: triplets,
		strictTriplets: glyph.strictTriplets,
		// avalibility
		avaliables: avaliables,
		// other parameters
		strategy: strategy,
		ppem: ppem,
		uppx: uppx,
		glyphTop: glyphTop,
		glyphBottom: glyphBottom,
		WIDTH_GEAR_MIN: WIDTH_GEAR_MIN,
		WIDTH_GEAR_PROPER: WIDTH_GEAR_PROPER,
		noAblation: false
	};

	// Pass 4 : Width allocation

	function assignWidths (res) {
		for (var j = 0; j < stems.length; j++) {
			stems[j].touchwidth = res.w[j] * uppx;
			stems[j].ytouch = res.y[j] * uppx;
		}
	}

	for (var j = 0; j < stems.length; j++) {
		stems[j].ytouch = stems[j].yori;
		stems[j].touchwidth = uppx;
	}

	var stemPositions = [];
	for (var j = 0; j < stems.length; j++) {
		stemPositions[j] = avaliables[j].center;
	}
	stemPositions = uncollide(stemPositions, env, stems.length > 10 ? 3 : 2, strategy.POPULATION_LIMIT * Math.max(1, stems.length));

	assignWidths(allocateWidth(stemPositions, env));
	return stemPositionToActions(stems, uppx, env);
}

exports.hint = hint;
