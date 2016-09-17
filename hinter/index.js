"use strict"

var util = require('util');
var roundings = require('../roundings');

var evolve = require('./evolve');
var Individual = require('./individual');
var uncollide = require('./uncollide');
var balance = require("./balance");
var earlyAdjust = require("./early");
var allocateWidth = require("./allocate-width");
var stemPositionToActions = require('./actions');

function xclamp(low, x, high) { return x < low ? low : x > high ? high : x }
function mix(a, b, x) { return a + (b - a) * x }
function aggerate(p, gamma) {
	if (p <= 0.5) {
		return mix(0.5, 0, Math.pow((0.5 - p) * 2, gamma))
	} else {
		return mix(0.5, 1, Math.pow((p - 0.5) * 2, gamma))
	}
}

function hint(glyph, ppem, strategy) {

	var stems = glyph.stems;
	if (!stems.length) return [];

	var upm = strategy.UPM || 1000;
	var uppx = upm / ppem;
	var MIN_STEM_WIDTH = strategy.MIN_STEM_WIDTH;
	var MAX_STEM_WIDTH = strategy.MAX_STEM_WIDTH;
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_SIDE_MIN_DIST_RISE = strategy.STEM_SIDE_MIN_DIST_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE || STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_SIDE_MIN_DIST_DESCENT = strategy.STEM_SIDE_MIN_DIST_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT || STEM_SIDE_MIN_DESCENT;

	var POPULATION_LIMIT = strategy.POPULATION_LIMIT || 200;
	var POPULATION_LIMIT_SMALL = strategy.POPULATION_LIMIT_SMALL || 100;
	var EVOLUTION_STAGES = strategy.EVOLUTION_STAGES || 15;
	var PPEM_INCREASE_GLYPH_LIMIT = strategy.PPEM_INCREASE_GLYPH_LIMIT || 20;

	var REBALANCE_PASSES = strategy.REBALANCE_PASSES || 1;
	var WIDTH_ALLOCATION_PASSES = strategy.WIDTH_ALLOCATION_PASSES || 5;

	var COEFF_DISTORT = strategy.COEFF_DISTORT || 10;

	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;

	var COLLISION_MIN_OVERLAP_RATIO = strategy.COLLISION_MIN_OVERLAP_RATIO || 0.2;

	var PPEM_STEM_WIDTH_GEARS = strategy.PPEM_STEM_WIDTH_GEARS || [[0, 1, 1], [13, 1, 2], [21, 2, 2], [27, 2, 3], [32, 3, 3]];
	var CANONICAL_STEM_WIDTH = (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? strategy.CANONICAL_STEM_WIDTH_SMALL : strategy.CANONICAL_STEM_WIDTH) || 65;
	var CANONICAL_STEM_WIDTH_DENSE = strategy.CANONICAL_STEM_WIDTH_DENSE || CANONICAL_STEM_WIDTH;

	var WIDTH_GEAR_PROPER = Math.round(CANONICAL_STEM_WIDTH / uppx);
	var WIDTH_GEAR_MIN = Math.round(CANONICAL_STEM_WIDTH_DENSE / uppx);
	if (WIDTH_GEAR_MIN > WIDTH_GEAR_PROPER) WIDTH_GEAR_MIN = WIDTH_GEAR_PROPER;

	var ABLATION_IN_RADICAL = strategy.ABLATION_IN_RADICAL || 1;
	var ABLATION_RADICAL_EDGE = strategy.ABLATION_RADICAL_EDGE || 2;
	var ABLATION_GLYPH_EDGE = strategy.ABLATION_GLYPH_EDGE || 15;
	var ABLATION_GLYPH_HARD_EDGE = strategy.ABLATION_GLYPH_HARD_EDGE || 25;

	var COEFF_PORPORTION_DISTORTION = strategy.COEFF_PORPORTION_DISTORTION || 4;

	var BLUEZONE_BOTTOM_CENTER = strategy.BLUEZONE_BOTTOM_CENTER || -75;
	var BLUEZONE_TOP_CENTER = strategy.BLUEZONE_TOP_CENTER || 840;
	var BLUEZONE_BOTTOM_BAR = strategy.BLUEZONE_BOTTOM_BAR || -65;
	var BLUEZONE_TOP_BAR = strategy.BLUEZONE_TOP_BAR || 825;
	var BLUEZONE_BOTTOM_DOTBAR = strategy.BLUEZONE_BOTTOM_DOTBAR || BLUEZONE_BOTTOM_BAR;
	var BLUEZONE_TOP_DOTBAR = strategy.BLUEZONE_TOP_DOTBAR || BLUEZONE_TOP_BAR;

	var DONT_ADJUST_STEM_WIDTH = strategy.DONT_ADJUST_STEM_WIDTH || false;

	var round = roundings.Rtg(upm, ppem);
	var roundDown = roundings.Rdtg(upm, ppem);
	var roundUp = roundings.Rutg(upm, ppem);


	var pixelBottom = round(BLUEZONE_BOTTOM_CENTER);
	var oPixelTop = round(BLUEZONE_TOP_CENTER);
	var pixelTop = pixelBottom + round(BLUEZONE_TOP_CENTER - BLUEZONE_BOTTOM_CENTER);
	var glyfBottom = pixelBottom;
	var glyfTop = pixelTop;

	function calculateWidth(w) {
		var pixels = w / CANONICAL_STEM_WIDTH * WIDTH_GEAR_PROPER;

		var pixels0 = pixels;
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

	function atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > STEM_SIDE_MIN_DIST_RISE)
			&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > STEM_SIDE_MIN_DIST_RISE)
	}
	function atGlyphTop(stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
			&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > STEM_SIDE_MIN_RISE)
	}
	function atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT)
			&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT)
	};
	function atGlyphBottom(stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
			&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
	};

	var directOverlaps = glyph.directOverlaps;
	var overlaps = glyph.overlaps;
	var triplets = glyph.triplets;
	var flexes = glyph.flexes;

	var cyb = pixelBottom
		+ (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_BOTTOM_DOTBAR - BLUEZONE_BOTTOM_CENTER));
	var cyt = pixelTop
		- (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR));
	var cybx = pixelBottom
		+ (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_BOTTOM_BAR - BLUEZONE_BOTTOM_CENTER))
		+ Math.min(0, ppem <= PPEM_INCREASE_GLYPH_LIMIT ? pixelBottom - BLUEZONE_BOTTOM_BAR : pixelBottom - BLUEZONE_BOTTOM_CENTER);
	var cytx = pixelTop
		- (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR))
		+ Math.max(0, ppem <= PPEM_INCREASE_GLYPH_LIMIT ? oPixelTop - BLUEZONE_TOP_BAR : oPixelTop - BLUEZONE_TOP_CENTER);

	function cy(y, w0, w, x) {
		// x means this stroke is topmost or bottommost
		var p = (y - w0 - BLUEZONE_BOTTOM_BAR) / (BLUEZONE_TOP_BAR - BLUEZONE_BOTTOM_BAR - w0);
		if (x) {
			return w + cybx + (cytx - cybx - w) * p;
		} else {
			return w + cyb + (cyt - cyb - w) * p;
		}
	}
	function flexMiddleStem(t, m, b) {
		var spaceAboveOri = t.y0 - t.w0 / 2 - m.y0 + m.w0 / 2
		var spaceBelowOri = m.y0 - m.w0 / 2 - b.y0 + b.w0 / 2
		if (spaceAboveOri + spaceBelowOri > 0) {
			var totalSpaceFlexed = t.center - t.properWidth / 2 - b.center + b.properWidth / 2;
			var y = m.properWidth / 2 + b.center - b.properWidth / 2 + totalSpaceFlexed * (spaceBelowOri / (spaceBelowOri + spaceAboveOri));
			m.center = xclamp(m.low, y, m.high)
		}
	}

	function flexCenter(avaliables) {
		// fix top and bottom stems
		for (var j = 0; j < stems.length; j++) {
			if (!stems[j].hasGlyphStemBelow) {
				avaliables[j].high = Math.round(Math.max(
					avaliables[j].center,
					pixelBottom / uppx + avaliables[j].properWidth + (atGlyphBottom(stems[j]) ? 0 : 1
					)));
			};
			if (!stems[j].hasGlyphStemAbove) {
				avaliables[j].low = Math.round(avaliables[j].center);
			};
			if (ppem > PPEM_INCREASE_GLYPH_LIMIT && avaliables[j].properWidth < 3 && atGlyphBottom(stems[j]) && avaliables[j].high - avaliables[j].low <= 1 && avaliables[j].low <= pixelBottom / uppx + avaliables[j].properWidth + 0.1) {
				// Lock the bottommost stroke
				avaliables[j].high = avaliables[j].low;
			}
		}
		for (var j = 0; j < flexes.length; j++) {
			flexMiddleStem(avaliables[flexes[j][0]], avaliables[flexes[j][1]], avaliables[flexes[j][2]]);
		}
	};
	var avaliables = function (stems) {
		var avaliables = [], tws = [];
		for (var j = 0; j < stems.length; j++) {
			tws[j] = calculateWidth(stems[j].width);
		}
		// Coordinate widths
		var totalWidth = 0;
		var minWidth = 0xFFFF;
		for (var j = 0; j < stems.length; j++) {
			totalWidth += stems[j].width;
			if (minWidth > stems[j].width) {
				minWidth = stems[j].width
			}
		}
		var averageWidth = totalWidth / stems.length;
		var coordinateWidth = calculateWidth(averageWidth);
		for (var j = 0; j < stems.length; j++) {
			if (stems[j].width > averageWidth - uppx && tws[j] < coordinateWidth) {
				tws[j] = coordinateWidth;
			} else if (stems[j].width < averageWidth + uppx && tws[j] > coordinateWidth) {
				tws[j] = coordinateWidth;
			}
		}
		// Decide avaliability space
		for (var j = 0; j < stems.length; j++) {
			var y0 = stems[j].yori, w0 = stems[j].width;
			var w = tws[j] * uppx;
			// The bottom limit of a stem
			var lowlimit = atGlyphBottom(stems[j])
				? pixelBottom + Math.min(w, WIDTH_GEAR_MIN * uppx)
				: pixelBottom + Math.min(w, WIDTH_GEAR_MIN * uppx) + uppx;

			// Add additional space below strokes with a fold under it.
			if (stems[j].hasGlyphFoldBelow && !stems[j].hasGlyphStemBelow) {
				lowlimit = Math.max(pixelBottom + Math.max(coordinateWidth + 2, coordinateWidth > 2 ? coordinateWidth * 2 : coordinateWidth * 2 + 1) * uppx, lowlimit);
			} else if (stems[j].hasGlyphSideFoldBelow && !stems[j].hasGlyphStemBelow) {
				lowlimit = Math.max(pixelBottom + Math.max(coordinateWidth + 2, coordinateWidth * 2) * uppx, lowlimit);
			}

			// The top limit of a stem ('s upper edge)
			var highlimit = ppem <= PPEM_INCREASE_GLYPH_LIMIT // small sizes
				? pixelTop - (atGlyphTop(stems[j]) ? 0 : uppx) // leave 0px for top stroke, 1 for non-top
				: pixelTop - xclamp( // for larger size, consider BLUEZONE_TOP_BAR's value
					atGlyphTop(stems[j]) ? 0 : uppx,
					atGlyphTop(stems[j])
						? round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR) + roundDown(BLUEZONE_TOP_BAR - y0)
						: Math.max(
							round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR),
							roundDown(BLUEZONE_TOP_BAR - y0)
						),
					WIDTH_GEAR_MIN * uppx);

			var looseRoundingLow = ppem > PPEM_INCREASE_GLYPH_LIMIT && !(stems[j].hasGlyphFoldBelow && !stems[j].hasGlyphStemBelow || stems[j].hasGlyphSideFoldBelow && !stems[j].hasGlyphStemBelow);
			var looseRoundingHigh = ppem > PPEM_INCREASE_GLYPH_LIMIT;

			var center0 = cy(y0, w0, w, atGlyphTop(stems[j]) || atGlyphBottom(stems[j]));
			var low = xclamp(lowlimit, looseRoundingLow ? round(center0 - 2 * uppx) : round(center0) - uppx, highlimit);
			var high = xclamp(lowlimit, looseRoundingHigh ? round(center0 + 2 * uppx) : round(center0) + uppx, highlimit);
			var center = xclamp(low, center0, high);

			var ablationCoeff = atGlyphTop(stems[j]) || atGlyphBottom(stems[j]) ? ABLATION_GLYPH_HARD_EDGE
				: !stems[j].hasGlyphStemAbove || !stems[j].hasGlyphStemBelow ? ABLATION_GLYPH_EDGE
					: !stems[j].hasSameRadicalStemAbove || !stems[j].hasSameRadicalStemBelow ? ABLATION_RADICAL_EDGE : ABLATION_IN_RADICAL;
			avaliables[j] = {
				low: Math.round(low / uppx),
				high: Math.round(high / uppx),
				properWidth: tws[j],
				center: center / uppx,
				ablationCoeff: ablationCoeff / uppx * (1 + 0.5 * (stems[j].xmax - stems[j].xmin) / upm),
				y0: y0,
				w0: w0,
				xmin: stems[j].xmin,
				xmax: stems[j].xmax,
				length: stems[j].xmax - stems[j].xmin,
				atGlyphTop: atGlyphTop(stems[j]),
				atGlyphBottom: atGlyphBottom(stems[j]),
				hasGlyphStemAbove: stems[j].hasGlyphStemAbove,
				hasGlyphFoldBelow: stems[j].hasGlyphFoldBelow
			};
		};
		flexCenter(avaliables);
		for (var j = 0; j < stems.length; j++) {
			avaliables[j].proportion = (avaliables[j].center - avaliables[0].center) / (avaliables[avaliables.length - 1].center - avaliables[0].center) || 0
		};
		return avaliables;
	} (stems);

	var env = {
		A: glyph.collisionMatrices.alignment,
		C: glyph.collisionMatrices.collision,
		S: glyph.collisionMatrices.swap,
		P: glyph.collisionMatrices.promixity,
		symmetry: (function () {
			var sym = [];
			for (var j = 0; j < avaliables.length; j++) {
				sym[j] = [];
				for (var k = 0; k < j; k++) {
					sym[j][k] = !directOverlaps[j][k]
						&& Math.abs(avaliables[j].y0 - avaliables[k].y0) < 0.3 * uppx
						&& Math.abs(avaliables[j].y0 - avaliables[j].w0 - avaliables[k].y0 + avaliables[k].w0) < 0.3 * uppx
						&& Math.abs(avaliables[j].length - avaliables[k].length) < 0.3 * uppx
						&& (avaliables[j].atGlyphTop === avaliables[k].atGlyphTop)
						&& (avaliables[j].atGlyphBottom === avaliables[k].atGlyphBottom);
				}
			};
			return sym;
		})(),
		directOverlaps: directOverlaps,
		triplets: triplets,
		avaliables: avaliables,
		strategy: strategy,
		ppem: ppem,
		uppx: uppx,
		glyfTop: glyfTop,
		glyfBottom: glyfBottom,
		pixelTop: pixelTop,
		pixelBottom: pixelBottom,
		WIDTH_GEAR_MIN: WIDTH_GEAR_MIN,
		WIDTH_GEAR_PROPER: WIDTH_GEAR_PROPER,
		noAblation: false
	}

	// Pass 4 : Width allocation

	function assignWidths(res) {
		for (var j = 0; j < stems.length; j++) {
			stems[j].touchwidth = res.w[j] * uppx;
			stems[j].ytouch = res.y[j] * uppx;
		};
	}

	for (var j = 0; j < stems.length; j++) {
		stems[j].ytouch = stems[j].yori;
		stems[j].touchwidth = uppx;
	};

	var stemPositions = (function () {
		var y0 = [];
		for (var j = 0; j < stems.length; j++) {
			y0[j] = Math.round(avaliables[j].center);
		}
		var og = new Individual(y0, env);
		if (og.collidePotential <= 0) {
			y0 = uncollide(y0, env, 4, POPULATION_LIMIT_SMALL);
			y0 = balance(y0, env);
		} else {
			y0 = earlyAdjust(y0.length, env);
			env.noAblation = true;
			y0 = uncollide(y0, env, 6, POPULATION_LIMIT);
			y0 = balance(y0, env);
			env.noAblation = false;
			y0 = uncollide(y0, env, 4, POPULATION_LIMIT);
			y0 = balance(y0, env);
		};
		return y0;
	})();

	assignWidths(allocateWidth(stemPositions, env));
	return stemPositionToActions(stems, uppx);
}

exports.hint = hint;