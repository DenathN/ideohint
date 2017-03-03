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

var monoip = require('./monotonic-interpolate');

function xclamp(low, x, high) { return x < low ? low : x > high ? high : x; }
function lerp(x, x1, x2, y1, y2) {
	return (x - x1) / (x2 - x1) * (y2 - y1) + y1;
}
function xlerp(x, x1, x2, x3, y1, y2, y3) {
	if (x <= x2) {
		return (x - x1) / (x2 - x1) * (y2 - y1) + y1;
	} else {
		return (x - x2) / (x3 - x2) * (y3 - y2) + y2;
	}
}

function toVQ(v, ppem) {
	if (v && v instanceof Array) {
		return monoip(v)(ppem)
	} else {
		return v;
	}
}

function hint(glyph, ppem, strategy) {
	var stems = glyph.stems;
	if (!stems.length) return [];

	// Hinting parameters
	const upm = strategy.UPM || 1000;
	const uppx = upm / ppem;
	const STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE;
	const STEM_SIDE_MIN_DIST_RISE = strategy.STEM_SIDE_MIN_DIST_RISE;
	const STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE;
	const STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT;
	const STEM_SIDE_MIN_DIST_DESCENT = strategy.STEM_SIDE_MIN_DIST_DESCENT;
	const STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT;

	const PPEM_INCREASE_GLYPH_LIMIT = strategy.PPEM_INCREASE_GLYPH_LIMIT;

	const CANONICAL_STEM_WIDTH = toVQ(strategy.CANONICAL_STEM_WIDTH, ppem);
	const CANONICAL_STEM_WIDTH_DENSE = toVQ(strategy.CANONICAL_STEM_WIDTH, ppem);

	const WIDTH_GEAR_PROPER = Math.round(CANONICAL_STEM_WIDTH / uppx);
	const WIDTH_GEAR_MIN = Math.min(WIDTH_GEAR_PROPER, Math.round(CANONICAL_STEM_WIDTH_DENSE / uppx));
	const SHRINK_THERSHOLD = strategy.SHRINK_THERSHOLD || 0.75;

	const ABLATION_IN_RADICAL = strategy.ABLATION_IN_RADICAL;
	const ABLATION_RADICAL_EDGE = strategy.ABLATION_RADICAL_EDGE;
	const ABLATION_GLYPH_EDGE = strategy.ABLATION_GLYPH_EDGE;
	const ABLATION_GLYPH_HARD_EDGE = strategy.ABLATION_GLYPH_HARD_EDGE;

	const COEFF_PORPORTION_DISTORTION = strategy.COEFF_PORPORTION_DISTORTION;

	const BLUEZONE_BOTTOM_CENTER = strategy.BLUEZONE_BOTTOM_CENTER;
	const BLUEZONE_BOTTOM_BAR_REF = toVQ(strategy.BLUEZONE_BOTTOM_BAR_REF, ppem);
	const BLUEZONE_BOTTOM_BAR = strategy.BLUEZONE_BOTTOM_BAR
		? monoip(strategy.BLUEZONE_BOTTOM_BAR)(ppem)
		: xlerp(ppem,
			strategy.PPEM_MIN, strategy.BLUEZONE_BOTTOM_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
			strategy.BLUEZONE_BOTTOM_BAR_SMALL, strategy.BLUEZONE_BOTTOM_BAR_MIDDLE, strategy.BLUEZONE_BOTTOM_BAR_LARGE);
	const BLUEZONE_BOTTOM_DOTBAR = strategy.BLUEZONE_BOTTOM_DOTBAR
		? monoip(strategy.BLUEZONE_BOTTOM_DOTBAR)(ppem)
		: xlerp(ppem,
			strategy.PPEM_MIN, strategy.BLUEZONE_BOTTOM_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
			strategy.BLUEZONE_BOTTOM_DOTBAR_SMALL, strategy.BLUEZONE_BOTTOM_DOTBAR_MIDDLE, strategy.BLUEZONE_BOTTOM_DOTBAR_LARGE);

	const BLUEZONE_TOP_CENTER = strategy.BLUEZONE_TOP_CENTER;
	const BLUEZONE_TOP_BAR_REF = toVQ(strategy.BLUEZONE_TOP_BAR_REF, ppem);
	const BLUEZONE_TOP_DOTBAR = strategy.BLUEZONE_TOP_DOTBAR
		? monoip(strategy.BLUEZONE_TOP_DOTBAR)(ppem)
		: xlerp(ppem,
			strategy.PPEM_MIN, strategy.BLUEZONE_TOP_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
			strategy.BLUEZONE_TOP_DOTBAR_SMALL, strategy.BLUEZONE_TOP_DOTBAR_MIDDLE, strategy.BLUEZONE_TOP_DOTBAR_LARGE);
	const BLUEZONE_TOP_BAR = strategy.BLUEZONE_TOP_BAR
		? monoip(strategy.BLUEZONE_TOP_BAR)(ppem)
		: xlerp(ppem,
			strategy.PPEM_MIN, strategy.BLUEZONE_TOP_BAR_MIDDLE_SIZE, strategy.PPEM_MAX,
			strategy.BLUEZONE_TOP_BAR_SMALL, strategy.BLUEZONE_TOP_BAR_MIDDLE, strategy.BLUEZONE_TOP_BAR_LARGE);

	const round = roundings.Rtg(upm, ppem);
	const roundDown = roundings.Rdtg(upm, ppem);
	const roundUp = roundings.Rutg(upm, ppem);


	const glyphBottom = round(BLUEZONE_BOTTOM_CENTER);
	const oPixelTop = round(BLUEZONE_TOP_CENTER);
	const glyphTop = glyphBottom + round(BLUEZONE_TOP_CENTER - BLUEZONE_BOTTOM_CENTER);
	const refStemTop = round(BLUEZONE_TOP_BAR);

	function atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > STEM_SIDE_MIN_DIST_RISE)
			&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > STEM_SIDE_MIN_DIST_RISE);
	}
	function atGlyphTop(stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
			&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > STEM_SIDE_MIN_RISE);
	}
	function atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT)
			&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT);
	}
	function atGlyphBottom(stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
			&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > STEM_SIDE_MIN_DESCENT);
	}

	const directOverlaps = glyph.directOverlaps;
	const overlaps = glyph.overlaps;
	const triplets = glyph.triplets;
	const flexes = glyph.flexes;

	const cyb = glyphBottom + (round(BLUEZONE_BOTTOM_DOTBAR - BLUEZONE_BOTTOM_CENTER));
	const cyt = glyphTop - (round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR));
	const cybx = glyphBottom + (round(BLUEZONE_BOTTOM_BAR - BLUEZONE_BOTTOM_CENTER))
		+ Math.min(0, glyphBottom - BLUEZONE_BOTTOM_BAR);
	const cytx = glyphTop - (round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR))
		+ Math.max(0, oPixelTop - BLUEZONE_TOP_BAR);

	function cy(y, w0, w, x, att) {
		// x means this stroke is topmost or bottommost
		if (att) {
			const p = (y - BLUEZONE_BOTTOM_BAR_REF) / (BLUEZONE_TOP_BAR_REF - BLUEZONE_BOTTOM_BAR_REF);
			if (x) {
				return cybx + (cytx - cybx) * p;
			} else {
				return cyb + (cyt - cyb) * p;
			}
		} else {
			const p = (y - w0 - BLUEZONE_BOTTOM_BAR_REF) / (BLUEZONE_TOP_BAR_REF - BLUEZONE_BOTTOM_BAR_REF);
			if (x) {
				return w + cybx + (cytx - cybx) * p;
			} else {
				return w + cyb + (cyt - cyb) * p;
			}
		}
	}
	function flexMiddleStem(t, m, b) {
		const spaceAboveOri = t.y0 - t.w0 / 2 - m.y0 + m.w0 / 2;
		const spaceBelowOri = m.y0 - m.w0 / 2 - b.y0 + b.w0 / 2;
		if (spaceAboveOri + spaceBelowOri > 0) {
			const totalSpaceFlexed = t.center - t.properWidth / 2 - b.center + b.properWidth / 2;
			const y = m.properWidth / 2 + b.center - b.properWidth / 2 + totalSpaceFlexed * (spaceBelowOri / (spaceBelowOri + spaceAboveOri));
			m.center = xclamp(m.low, y, m.high);
		}
	}

	function flexCenter(avaliables) {
		// fix top and bottom stems
		for (var j = 0; j < stems.length; j++) {
			if (!stems[j].hasGlyphStemBelow) {
				avaliables[j].high = Math.round(Math.max(
					avaliables[j].center,
					glyphBottom / uppx + avaliables[j].properWidth + (atGlyphBottom(stems[j]) ? 0 : 1
					)));
			}
			if (!stems[j].hasGlyphStemAbove && !stems[j].diagLow) {
				// lock top
				avaliables[j].low = Math.round(avaliables[j].center);
			}
			if (ppem <= strategy.PPEM_LOCK_BOTTOM && atGlyphBottom(stems[j]) && !avaliables[j].diagLow
				&& avaliables[j].high - avaliables[j].low <= 1
				&& avaliables[j].low <= glyphBottom / uppx + avaliables[j].properWidth + 0.1) {
				// Lock the bottommost stroke
				avaliables[j].high -= 1;
				if (avaliables[j].high < avaliables[j].low) avaliables[j].high = avaliables[j].low;
			}
		}
		for (var j = 0; j < flexes.length; j++) {
			flexMiddleStem(avaliables[flexes[j][0]], avaliables[flexes[j][1]], avaliables[flexes[j][2]]);
		}
		for (let s of avaliables) {
			if (s.diagLow && s.center >= glyphTop / uppx - 0.5) {
				s.center = xclamp(s.low, glyphTop / uppx - 1, s.center);
				s.softHigh = s.center;
			}
			if (s.diagHigh && s.center <= glyphBottom / uppx + 0.5) {
				s.center = xclamp(s.center, glyphBottom / uppx + 1, s.high);
				s.softLow = s.center;
			}
		}
	}

	function calculateWidth(w, coordinate) {
		var pixels0 = w / uppx;
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
		let rpx = Math.round(pixels);
		if (rpx > WIDTH_GEAR_MIN && rpx - pixels0 > SHRINK_THERSHOLD) {
			rpx -= 1;
		}
		return rpx;
	}

	function decideWidths(stems, priority, tws) {
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
			var y0 = stems[j].y, w0 = stems[j].width;
			var w = tws[j] * uppx;
			// The bottom limit of a stem
			var lowlimit = atGlyphBottom(stems[j])
				? stems[j].diagHigh
					? ppem <= PPEM_INCREASE_GLYPH_LIMIT
						? glyphBottom + w
						: glyphBottom + w + uppx
					: glyphBottom + w
				: glyphBottom + w + uppx;
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
					? stems[j].diagHigh
						? 0
						: (y0 > BLUEZONE_TOP_BAR && ppem <= PPEM_INCREASE_GLYPH_LIMIT
							? round(BLUEZONE_TOP_CENTER - y0)
							: round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR) + roundDown(BLUEZONE_TOP_BAR - y0))
					: (y0 > BLUEZONE_TOP_DOTBAR && ppem <= PPEM_INCREASE_GLYPH_LIMIT
						? round(BLUEZONE_TOP_CENTER - y0)
						: Math.max(
							round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR),
							roundDown(BLUEZONE_TOP_BAR - y0)
						)),
				WIDTH_GEAR_MIN * uppx);
			if (highlimit > refStemTop && !stems[j].diagHigh) highlimit = refStemTop
			if (stems[j].hasGlyphFoldAbove && !stems[j].hasGlyphStemAbove || stems[j].hasEntireContourAbove) {
				highlimit = Math.min(glyphTop - 2 * uppx, highlimit);
			}

			var center0 = cy(y0, w0, w, atGlyphTop(stems[j]) && !stems[j].diagLow || atGlyphBottom(stems[j]) && stems[j].diagHigh, stems[j].posKeyAtTop);
			var maxshift = xclamp(1, ppem / 16, 2);
			var lowlimitW = tws[j] > 1 ? lowlimit - uppx : lowlimit;
			var lowW = xclamp(lowlimitW, round(center0 - maxshift * uppx), highlimit);
			var highW = xclamp(lowlimitW, round(center0 + maxshift * uppx), highlimit);
			var low = xclamp(lowlimit, round(center0 - maxshift * uppx), highlimit);
			var high = xclamp(lowlimit, round(center0 + maxshift * uppx), highlimit);
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
				// soft high/low limits, affects ablation potential
				softLow: Math.round(low / uppx),
				softHigh: Math.round(high / uppx),
				// its proper width, in pixels
				properWidth: tws[j],
				// its proper position, in pixels
				center: center / uppx,
				ablationCoeff: ablationCoeff / uppx * (1 + 0.5 * (stems[j].xmax - stems[j].xmin) / upm),
				// original position and width
				y0: y0,
				w0: w0,
				w0px: w0 / uppx,
				xmin: stems[j].xmin,
				xmax: stems[j].xmax,
				length: stems[j].xmax - stems[j].xmin,
				// spatial relationships
				atGlyphTop: atGlyphTop(stems[j]),
				atGlyphBottom: atGlyphBottom(stems[j]),
				hasGlyphStemAbove: stems[j].hasGlyphStemAbove,
				hasGlyphStemBelow: stems[j].hasGlyphStemBelow,
				hasFoldBelow: fold,
				posKeyAtTop: stems[j].posKeyAtTop,
				diagLow: stems[j].diagLow,
				diagHigh: stems[j].diagHigh,
				rid: stems[j].rid
			};
		}
		flexCenter(avaliables);
		for (var j = 0; j < stems.length; j++) {
			if (avaliables[j].diagLow) { avaliables[j].softHigh = avaliables[j].center }
			if (avaliables[j].diagHigh) { avaliables[j].softLow = avaliables[j].center }
		}
		for (var j = 0; j < stems.length; j++) {
			avaliables[j].proportion =
				(avaliables[j].center - avaliables[0].center) / (avaliables[avaliables.length - 1].center - avaliables[0].center)
				|| 0;
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
						&& !avaliables[j].diagHigh && !avaliables[k].diagHigh
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

	var stemPositions = [];
	for (var j = 0; j < stems.length; j++) {
		stemPositions[j] = avaliables[j].center;
	}
	stemPositions = uncollide(stemPositions, env,
		xclamp(2, Math.round(stems.length / strategy.STEADY_STAGES_X), strategy.STEADY_STAGES_MAX), // stages
		strategy.POPULATION_LIMIT * Math.max(1, stems.length) // population
	);

	let { y, w } = allocateWidth(stemPositions, env);
	return stemPositionToActions(y, w, stems, uppx, env);
}

exports.hint = hint;
