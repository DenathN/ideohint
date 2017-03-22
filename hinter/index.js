"use strict";

const util = require("util");
const roundings = require("../roundings");
const toposort = require("toposort");

const evolve = require("./evolve");
const Individual = require("./individual");
const uncollide = require("./uncollide");
const balance = require("./balance");
const earlyAdjust = require("./early");
const allocateWidth = require("./allocate-width");
const stemPositionToActions = require("./actions");

const { lerp, xlerp, xclamp } = require('../support/common');
const monoip = require('../support/monotonic-interpolate');

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

	const TOP_CUT = Math.round(toVQ(strategy.TOP_CUT, ppem)) * uppx;
	const BOTTOM_CUT = Math.round(toVQ(strategy.BOTTOM_CUT, ppem)) * uppx;
	const TOP_CUT_DIAGH = Math.round(toVQ(strategy.TOP_CUT_DIAGH, ppem)) * uppx;
	const BOTTOM_CUT_DIAGL = Math.round(toVQ(strategy.BOTTOM_CUT_DIAGL, ppem)) * uppx;
	const TOP_CUT_DIAG_DIST = Math.round(toVQ(strategy.TOP_CUT_DIAG_DIST, ppem)) * uppx;
	const BOTTOM_CUT_DIAG_DIST = Math.round(toVQ(strategy.BOTTOM_CUT_DIAG_DIST, ppem)) * uppx;

	const RISE = toVQ(strategy.RISE, ppem) / 200;
	const SINK = toVQ(strategy.SINK, ppem) / 200;
	const RISE_DIAGH = toVQ(strategy.RISE_DIAGH, ppem) / 200;
	const SINK_DIAGL = toVQ(strategy.SINK_DIAGL, ppem) / 200;
	const CHEBYSHEV_2 = toVQ(strategy.GRAVITY, ppem) / -200;
	const CHEBYSHEV_3 = toVQ(strategy.CONCENTRATE, ppem) / 200;
	const CHEBYSHEV_4 = toVQ(strategy.CHEBYSHEV_4, ppem) / -200;
	const CHEBYSHEV_5 = toVQ(strategy.CHEBYSHEV_5, ppem) / 200;

	function risefn(x) {
		return x * x * x * x * x * x
	}

	function cheby(_x, extreme) {
		const x = _x * 2 - 1;
		const rise = RISE + (extreme ? RISE_DIAGH : 0);
		const sink = SINK + (extreme ? SINK_DIAGL : 0);
		const y = x + rise * risefn(_x) - sink * risefn(1 - _x);
		const dy = CHEBYSHEV_2 * (2 * x * x - 1)
			+ CHEBYSHEV_3 * (4 * x * x * x - 3 * x)
			+ CHEBYSHEV_4 * (8 * x * x * x * x - 8 * x * x + 1)
			+ CHEBYSHEV_5 * (16 * x * x * x * x * x - 20 * x * x * x + 5 * x);
		const dy0 = CHEBYSHEV_2 - CHEBYSHEV_3 + CHEBYSHEV_4 - CHEBYSHEV_5;
		const dy1 = CHEBYSHEV_2 + CHEBYSHEV_3 + CHEBYSHEV_4 + CHEBYSHEV_5;
		const fdy = (_x < 0 || _x > 1) ? 0 : dy - dy0 - (dy1 - dy0) * (x + 1) / 2;
		return (y + fdy + 1) / 2;
	}

	const WIDTH_GEAR_PROPER = Math.round(CANONICAL_STEM_WIDTH / uppx);
	const WIDTH_GEAR_MIN = Math.min(WIDTH_GEAR_PROPER, Math.round(CANONICAL_STEM_WIDTH_DENSE / uppx));
	const SHRINK_THERSHOLD = strategy.SHRINK_THERSHOLD || 0.75;

	const ABLATION_IN_RADICAL = strategy.ABLATION_IN_RADICAL;
	const ABLATION_RADICAL_EDGE = strategy.ABLATION_RADICAL_EDGE;
	const ABLATION_GLYPH_EDGE = strategy.ABLATION_GLYPH_EDGE;
	const ABLATION_GLYPH_HARD_EDGE = strategy.ABLATION_GLYPH_HARD_EDGE;

	const BLUEZONE_BOTTOM_CENTER = strategy.BLUEZONE_BOTTOM_CENTER;
	const BLUEZONE_TOP_CENTER = strategy.BLUEZONE_TOP_CENTER;

	const round = roundings.Rtg(upm, ppem);
	const roundDown = roundings.Rdtg(upm, ppem);
	const roundUp = roundings.Rutg(upm, ppem);


	const glyphBottom = round(BLUEZONE_BOTTOM_CENTER);
	const oPixelTop = round(BLUEZONE_TOP_CENTER);
	const glyphTop = glyphBottom + round(BLUEZONE_TOP_CENTER - BLUEZONE_BOTTOM_CENTER);

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

	function cy(y, w0, w, extreme, posKeyAtTop) {
		const p = (y - w0 - BLUEZONE_BOTTOM_CENTER) / (BLUEZONE_TOP_CENTER - BLUEZONE_BOTTOM_CENTER - w0);
		return w + glyphBottom + (glyphTop - glyphBottom - w) * cheby(p, extreme);
	}

	function flexCenter(avaliables) {
		// fix top and bottom stems
		for (var j = 0; j < stems.length; j++) {
			const avail = avaliables[j], stem = stems[j];
			if (!stem.hasGlyphStemBelow) {
				avail.high = Math.round(Math.max(
					avail.center,
					glyphBottom / uppx + avail.properWidth + (atGlyphBottom(stem) ? 0 : 1
					)));
			}
			if (!stem.hasGlyphStemAbove && !stem.diagLow) {
				// lock top
				avail.low = Math.round(avail.center);
			}
			if (atGlyphBottom(stem) && !avail.diagLow
				&& avail.high - avail.low <= 1
				&& avail.low <= glyphBottom / uppx + avail.properWidth + 0.1
				&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT / 3)
				&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT / 3)) {
				// Lock the bottommost stroke
				avail.high -= 1;
				if (avail.high < avail.low) avail.high = avail.low;
			}
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
		for (var j = 0; j < stems.length; j++) {
			if (tws[j] < 1) {
				tws[j] = 1
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
			const stem = stems[j], y0 = stem.y, w0 = stem.width, w = tws[j] * uppx;
			// The bottom limit of a stem
			let lowlimit = glyphBottom + Math.max(
				w,
				stem.diagLow
					? BOTTOM_CUT_DIAGL
					: stem.diagHigh
						? (BOTTOM_CUT_DIAGL + BOTTOM_CUT_DIAG_DIST)
						: BOTTOM_CUT,
				atGlyphBottom(stem)
					? stem.diagHigh ? ppem <= PPEM_INCREASE_GLYPH_LIMIT ? w : w + uppx : w
					: w + uppx);
			let fold = false;
			// Add additional space below strokes with a fold under it.
			if (stem.hasGlyphFoldBelow && !stem.hasGlyphStemBelow) {
				lowlimit = Math.max(glyphBottom + Math.max(2, WIDTH_GEAR_PROPER + 1) * uppx + w, lowlimit);
				fold = true;
			} else if (stem.hasGlyphSideFoldBelow && !stem.hasGlyphStemBelow) {
				lowlimit = Math.max(glyphBottom + Math.max(WIDTH_GEAR_PROPER + 2, WIDTH_GEAR_PROPER * 2) * uppx, lowlimit);
				fold = true;
			}

			// The top limit of a stem ('s upper edge)
			let highlimit = glyphTop - Math.max(
				0,
				// cut part
				stem.diagHigh
					? TOP_CUT_DIAGH
					: stem.diagLow
						? (TOP_CUT_DIAGH + TOP_CUT_DIAG_DIST)
						: TOP_CUT,
				// spatial part
				atGlyphTop(stem) ? 0 : uppx);

			if (stem.hasEntireContourAbove) {
				highlimit = Math.min(glyphTop - 2 * uppx, highlimit);
			}


			const center0 = cy(y0, w0, w, atGlyphTop(stem) && stem.diagHigh || atGlyphBottom(stem) && stem.diagLow, stem.posKeyAtTop);
			const maxshift = xclamp(1, ppem / 16, 2);
			const lowlimitW = Math.max(glyphBottom + w, tws[j] > 1 ? lowlimit - uppx : lowlimit);
			const lowW = xclamp(lowlimitW, round(center0 - maxshift * uppx), highlimit);
			const highW = xclamp(lowlimitW, round(center0 + maxshift * uppx), highlimit);
			const low = xclamp(lowlimit, round(center0 - maxshift * uppx), highlimit);
			const high = xclamp(lowlimit, round(center0 + maxshift * uppx), highlimit);
			const center = xclamp(low, center0, high);

			const ablationCoeff = (atGlyphTop(stem) || atGlyphBottom(stem))
				? ABLATION_GLYPH_HARD_EDGE
				: (!stem.hasGlyphStemAbove || !stem.hasGlyphStemBelow)
					? ABLATION_GLYPH_EDGE
					: (!stem.hasSameRadicalStemAbove || !stem.hasSameRadicalStemBelow)
						? ABLATION_RADICAL_EDGE
						: ABLATION_IN_RADICAL;

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
				ablationCoeff: ablationCoeff / uppx * (1 + 0.5 * (stem.xmax - stem.xmin) / upm),
				// original position and width
				y0: y0,
				w0: w0,
				w0px: w0 / uppx,
				xmin: stem.xmin,
				xmax: stem.xmax,
				length: stem.xmax - stem.xmin,
				// spatial relationships
				atGlyphTop: atGlyphTop(stem),
				atGlyphBottom: atGlyphBottom(stem),
				hasGlyphStemAbove: stem.hasGlyphStemAbove,
				hasGlyphStemBelow: stem.hasGlyphStemBelow,
				hasFoldBelow: fold,
				posKeyAtTop: stem.posKeyAtTop,
				diagLow: stem.diagLow,
				diagHigh: stem.diagHigh,
				rid: stem.rid,
				belongRadical: stem.belongRadical
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
	var stemPositionsNoTang = avaliables.map(a => xclamp(a.low,
		Math.round(lerp(a.y0, glyph.stats.ymin, glyph.stats.ymax, glyphBottom, glyphTop) / uppx),
		a.high));

	stemPositions = uncollide(stemPositions, env,
		xclamp(2, Math.round(stems.length / strategy.STEADY_STAGES_X * stems.length / ppem), strategy.STEADY_STAGES_MAX), // stages
		strategy.POPULATION_LIMIT * Math.max(1, stems.length) // population
	);

	let idvUncol = new Individual(stemPositions, env);
	let idvNT = new Individual(stemPositionsNoTang, env);

	let b = idvUncol;
	if (idvNT.fitness > b.fitness) { b = idvNT; }

	let { y, w } = allocateWidth(b.gene, env);
	return stemPositionToActions(y, w, stems, uppx, env);
}

exports.hint = hint;
