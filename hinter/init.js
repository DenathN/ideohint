"use strict"

const roundings = require("../roundings");
const { mix, lerp, xlerp, xclamp } = require('../support/common');
const monoip = require('../support/monotonic-interpolate');

const Individual = require("./individual");
const uncollide = require("./uncollide");
const allocateWidth = require("./allocate-width");

function toVQ(v, ppem) {
	if (v && v instanceof Array) {
		return monoip(v)(ppem)
	} else {
		return v;
	}
}

function risefn(x) { return x * x * x * x * x * x }

class Hinter {
	constructor(strategy, glyph, ppem) {
		//// STRATEGY SPECIFIC
		this.strategy = strategy;
		this.ppem = ppem;
		const upm = strategy.UPM || 1000;
		this.upm = upm;
		this.uppx = upm / this.ppem;

		this.glyphTop = this.round(strategy.BLUEZONE_TOP_CENTER);
		this.glyphBottom = this.round(strategy.BLUEZONE_BOTTOM_CENTER);

		// SWP
		this.CANONICAL_STEM_WIDTH = toVQ(strategy.CANONICAL_STEM_WIDTH, ppem);
		this.CANONICAL_STEM_WIDTH_DENSE = toVQ(strategy.CANONICAL_STEM_WIDTH_DENSE, ppem);

		this.SHRINK_THERSHOLD = strategy.SHRINK_THERSHOLD || 0.75;
		this.WIDTH_GEAR_PROPER = Math.round(this.CANONICAL_STEM_WIDTH / this.uppx);
		this.WIDTH_GEAR_MIN = Math.min(this.WIDTH_GEAR_PROPER,
			Math.round(this.CANONICAL_STEM_WIDTH_DENSE / this.uppx));

		// FeatDP
		this.STEM_SIDE_MIN_RISE = Math.min(strategy.STEM_SIDE_MIN_RISE, this.uppx);
		this.STEM_SIDE_MIN_DIST_RISE = Math.min(strategy.STEM_SIDE_MIN_DIST_RISE, this.uppx);
		this.STEM_CENTER_MIN_RISE = Math.min(strategy.STEM_CENTER_MIN_RISE, this.uppx);
		this.STEM_SIDE_MIN_DESCENT = Math.min(strategy.STEM_SIDE_MIN_DESCENT, this.uppx);
		this.STEM_SIDE_MIN_DIST_DESCENT = Math.min(strategy.STEM_SIDE_MIN_DIST_DESCENT, this.uppx);
		this.STEM_CENTER_MIN_DESCENT = Math.min(strategy.STEM_CENTER_MIN_DESCENT, this.uppx);

		this.TOP_CUT = Math.round(toVQ(strategy.TOP_CUT, ppem)) * this.uppx;
		this.BOTTOM_CUT = Math.round(toVQ(strategy.BOTTOM_CUT, ppem)) * this.uppx;
		this.TOP_CUT_DIAGH = Math.round(toVQ(strategy.TOP_CUT_DIAGH, ppem)) * this.uppx;
		this.BOTTOM_CUT_DIAGL = Math.round(toVQ(strategy.BOTTOM_CUT_DIAGL, ppem)) * this.uppx;
		this.TOP_CUT_DIAG_DIST = Math.round(toVQ(strategy.TOP_CUT_DIAG_DIST, ppem)) * this.uppx;
		this.BOTTOM_CUT_DIAG_DIST = Math.round(toVQ(strategy.BOTTOM_CUT_DIAG_DIST, ppem)) * this.uppx;

		this.RISE = toVQ(strategy.RISE, ppem) / 200;
		this.SINK = toVQ(strategy.SINK, ppem) / 200;
		this.RISE_DIAGH = toVQ(strategy.RISE_DIAGH, ppem) / 200;
		this.SINK_DIAGL = toVQ(strategy.SINK_DIAGL, ppem) / 200;
		this.CHEBYSHEV_2 = toVQ(strategy.GRAVITY, ppem) / -200;
		this.CHEBYSHEV_3 = toVQ(strategy.CONCENTRATE, ppem) / 200;
		this.CHEBYSHEV_4 = toVQ(strategy.CHEBYSHEV_4, ppem) / -200;
		this.CHEBYSHEV_5 = toVQ(strategy.CHEBYSHEV_5, ppem) / 200;

		//// GLYPH SPECIFIC
		this.A = glyph.collisionMatrices.alignment;
		this.C = glyph.collisionMatrices.collision;
		this.S = glyph.collisionMatrices.swap;
		this.P = glyph.collisionMatrices.promixity;
		this.dominancePriority = glyph.dominancePriority;

		this.directOverlaps = glyph.directOverlaps;
		this.strictOverlaps = glyph.strictOverlaps;

		this.triplets = glyph.triplets;
		this.strictTriplets = glyph.strictTriplets;

		this.stats = glyph.stats;

		//// CALCULATED
		this.nStems = glyph.stems.length;
		this.avaliables = decideAvail.call(this, glyph.stems);
		this.symmetry = decideSymmetry.call(this);

		this.X_EXPAND = 1 + Math.round(toVQ(strategy.X_EXPAND, ppem)) / 100;
	}
	round(x) { return roundings.rtg(x, this.upm, this.ppem) }
	atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > this.STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > this.STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > this.STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > this.STEM_SIDE_MIN_DIST_RISE)
			&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > this.STEM_SIDE_MIN_DIST_RISE);
	}
	atGlyphTop(stem) {
		return this.atRadicalTop(stem) && !stem.hasGlyphStemAbove
			&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > this.STEM_CENTER_MIN_RISE)
			&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > this.STEM_SIDE_MIN_RISE)
			&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > this.STEM_SIDE_MIN_RISE);
	}

	atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > this.STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > this.STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > this.STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > this.STEM_SIDE_MIN_DIST_DESCENT)
			&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > this.STEM_SIDE_MIN_DIST_DESCENT);
	}

	atGlyphBottom(stem) {
		return this.atRadicalBottom(stem) && !stem.hasGlyphStemBelow
			&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > this.STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > this.STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > this.STEM_SIDE_MIN_DESCENT);
	}

	calculateWidthOfStem(w, coordinate) {
		var pixels0 = w / this.uppx;
		if (coordinate) {
			var pixels = w / this.CANONICAL_STEM_WIDTH * this.WIDTH_GEAR_PROPER;
		} else {
			var pixels = w / this.uppx;
		}

		if (pixels > this.WIDTH_GEAR_PROPER) pixels = this.WIDTH_GEAR_PROPER;
		if (pixels < this.WIDTH_GEAR_MIN) {
			if (this.WIDTH_GEAR_MIN < 3) {
				pixels = this.WIDTH_GEAR_MIN;
			} else if (pixels < this.WIDTH_GEAR_MIN - 0.8 && this.WIDTH_GEAR_MIN === this.WIDTH_GEAR_PROPER) {
				pixels = this.WIDTH_GEAR_MIN - 1;
			} else {
				pixels = this.WIDTH_GEAR_MIN;
			}
		}
		let rpx = Math.round(pixels);
		if (rpx > this.WIDTH_GEAR_MIN && rpx - pixels0 > this.SHRINK_THERSHOLD) {
			rpx -= 1;
		}
		return rpx;
	}

	cheby(_x, extreme) {
		const x = _x * 2 - 1;
		const rise = this.RISE + (extreme ? this.RISE_DIAGH : 0);
		const sink = this.SINK + (extreme ? this.SINK_DIAGL : 0);
		const y = x + rise * risefn(_x) - sink * risefn(1 - _x);
		const dy = this.CHEBYSHEV_2 * (2 * x * x - 1)
			+ this.CHEBYSHEV_3 * (4 * x * x * x - 3 * x)
			+ this.CHEBYSHEV_4 * (8 * x * x * x * x - 8 * x * x + 1)
			+ this.CHEBYSHEV_5 * (16 * x * x * x * x * x - 20 * x * x * x + 5 * x);
		const dy0 = this.CHEBYSHEV_2 - this.CHEBYSHEV_3 + this.CHEBYSHEV_4 - this.CHEBYSHEV_5;
		const dy1 = this.CHEBYSHEV_2 + this.CHEBYSHEV_3 + this.CHEBYSHEV_4 + this.CHEBYSHEV_5;
		const fdy = (_x < 0 || _x > 1) ? 0 : dy - dy0 - (dy1 - dy0) * (x + 1) / 2;
		return (y + fdy + 1) / 2;
	}

	cy(y, w0, w, extreme, posKeyAtTop) {
		const p = (y - w0 - this.strategy.BLUEZONE_BOTTOM_CENTER)
			/ (this.strategy.BLUEZONE_TOP_CENTER - this.strategy.BLUEZONE_BOTTOM_CENTER - w0);
		return w + this.glyphBottom + (this.glyphTop - this.glyphBottom - w) * this.cheby(p, extreme);
	}

	shouldTwopass() {
		let d = 0xffff;
		for (let j = 0; j < this.nStems; j++) for (let k = 0; k < j; k++) {
			if (this.directOverlaps[j][k]) {
				let d1 = this.avaliables[j].y0 - this.avaliables[j].properWidth * this.uppx
					- this.avaliables[k].y0;
				if (d1 < d) d = d1;
			}
		}
		if (d < 1) d = 1;
		return d <= 1.5 * this.uppx;
	}

	decideInitHint() {
		const { avaliables, strategy, ppem, uppx } = this;
		return avaliables.map(s => s.center);
	}

	decideInitHintNT() {
		const { avaliables, strategy, ppem, uppx } = this;
		return avaliables.map(a => xclamp(a.low,
			Math.round(lerp(a.y0, this.stats.ymin, this.stats.ymax, this.glyphBottom, this.glyphTop) / uppx),
			a.high));
	}

	uncollide(y) {
		const { avaliables, strategy, ppem, uppx } = this;
		const y1 = uncollide(y, this,
			xclamp(2, Math.round(this.nStems / strategy.STEADY_STAGES_X * this.nStems / ppem), strategy.STEADY_STAGES_MAX), // stages
			strategy.POPULATION_LIMIT * Math.max(1, this.nStems), // population
			true
		);
		if (this.shouldTwopass()) {
			const idvPass1 = this.createIndividual(y1);
			const y2 = uncollide(y1, this,
				xclamp(2, Math.round(this.nStems / strategy.STEADY_STAGES_X * this.nStems / ppem), strategy.STEADY_STAGES_MAX), // stages
				strategy.POPULATION_LIMIT * Math.max(1, this.nStems), // population
				false
			);
			const idvPass2 = this.createIndividual(y2);
			if (idvPass1.fitness < idvPass2.fitness) {
				return y2;
			} else {
				return y1;
			}
		} else {
			return y1;
		}
	}

	createIndividual(y) {
		return new Individual(y, this);
	}

	allocateWidth(y) {
		return allocateWidth(this.createIndividual(y).gene, this);
	}

	decideHint() {
		const { avaliables, strategy, ppem, uppx } = this;
		if (!avaliables.length) return { y: [], x: { expand: this.X_EXPAND } }

		const stemPositionsNoTang = this.decideInitHintNT();
		const idvNT = this.createIndividual(stemPositionsNoTang);

		const stemPositions = this.uncollide(this.decideInitHint());
		const idvUncol = this.createIndividual(stemPositions);

		let b = idvUncol;
		if (idvNT.fitness > b.fitness) { b = idvNT; }

		let { y, w } = allocateWidth(b.gene, this);
		return { y, w, xExpand: this.X_EXPAND }
	}
}

function decideAvail(stems) {
	const { upm, ppem, uppx, strategy } = this;
	const Y_UPTHIRD = mix(strategy.BLUEZONE_BOTTOM_CENTER, strategy.BLUEZONE_TOP_CENTER, 2 / 3);
	const Y_DOWNTHIRD = mix(strategy.BLUEZONE_BOTTOM_CENTER, strategy.BLUEZONE_TOP_CENTER, 1 / 3);
	var avaliables = [];
	var tws = decideWidths.call(this, stems, this.dominancePriority);
	// Decide avaliability space
	for (var j = 0; j < stems.length; j++) {
		const stem = stems[j], y0 = stem.y, w0 = stem.width, w = tws[j] * uppx;
		// The bottom limit of a stem
		let lowlimit = this.glyphBottom + Math.max(
			w,
			stem.diagLow
				? this.BOTTOM_CUT_DIAGL
				: stem.diagHigh
					? (this.BOTTOM_CUT_DIAGL + this.BOTTOM_CUT_DIAG_DIST)
					: this.BOTTOM_CUT,
			this.atGlyphBottom(stem)
				? stem.diagHigh ? ppem <= this.PPEM_INCREASE_GLYPH_LIMIT ? w : w + uppx : w
				: w + uppx);
		let fold = false;
		// Add additional space below strokes with a fold under it.
		if (stem.hasGlyphFoldBelow && !stem.hasGlyphStemBelow) {
			lowlimit = Math.max(lowlimit,
				this.glyphBottom + Math.max(2, this.WIDTH_GEAR_PROPER + 1) * uppx + w);
			fold = true;
		} else if (stem.hasGlyphSideFoldBelow && !stem.hasGlyphStemBelow) {
			lowlimit = Math.max(lowlimit,
				this.glyphBottom + Math.max(this.WIDTH_GEAR_PROPER + 2, this.WIDTH_GEAR_PROPER * 2) * uppx);
			fold = true;
		}

		// The top limit of a stem ('s upper edge)
		let highlimit = this.glyphTop - Math.max(
			0,
			// cut part
			stem.diagHigh
				? this.TOP_CUT_DIAGH
				: stem.diagLow
					? (this.TOP_CUT_DIAGH + this.TOP_CUT_DIAG_DIST)
					: this.TOP_CUT,
			// spatial part
			this.atGlyphTop(stem) ? 0 : uppx);

		if (stem.hasEntireContourAbove) {
			highlimit = Math.min(this.glyphTop - 2 * uppx, highlimit);
		}

		const center0 = this.cy(y0, w0, w,
			this.atGlyphTop(stem) && stem.diagHigh
			|| this.atGlyphBottom(stem) && stem.diagLow,
			stem.posKeyAtTop);
		const maxShiftU = xclamp(0.75, ppem / 16,
			xclamp(1, lerp(y0 - w0 / 2, strategy.BLUEZONE_TOP_CENTER, strategy.BLUEZONE_BOTTOM_CENTER, 1, 3), 2));
		const maxShiftD = xclamp(0.75, ppem / 16, xclamp(1, lerp(y0 - w0 / 2, strategy.BLUEZONE_TOP_CENTER, strategy.BLUEZONE_BOTTOM_CENTER, 3, 1), 2));
		const lowlimitW = Math.max(this.glyphBottom + w, tws[j] > 1 ? lowlimit - uppx : lowlimit);
		const lowW = xclamp(lowlimitW, this.round(center0 - maxShiftD * uppx), highlimit);
		const highW = xclamp(lowlimitW, this.round(center0 + maxShiftU * uppx), highlimit);
		const low = xclamp(lowlimit, this.round(center0 - maxShiftD * uppx), highlimit);
		const high = xclamp(lowlimit, this.round(center0 + maxShiftU * uppx), highlimit);
		const center = xclamp(low, center0, high);

		const ablationCoeff = (this.atGlyphTop(stem) || this.atGlyphBottom(stem))
			? this.strategy.ABLATION_GLYPH_HARD_EDGE
			: (!stem.hasGlyphStemAbove || !stem.hasGlyphStemBelow)
				? this.strategy.ABLATION_GLYPH_EDGE
				: (!stem.hasSameRadicalStemAbove || !stem.hasSameRadicalStemBelow)
					? this.strategy.ABLATION_RADICAL_EDGE
					: this.strategy.ABLATION_IN_RADICAL;

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
			atGlyphTop: this.atGlyphTop(stem),
			atGlyphBottom: this.atGlyphBottom(stem),
			hasGlyphStemAbove: stem.hasGlyphStemAbove,
			hasGlyphStemBelow: stem.hasGlyphStemBelow,
			hasSameRadicalStemAbove: stem.hasSameRadicalStemAbove,
			hasSameRadicalStemBelow: stem.hasSameRadicalStemBelow,
			hasFoldBelow: fold,
			posKeyAtTop: stem.posKeyAtTop,
			diagLow: stem.diagLow,
			diagHigh: stem.diagHigh,
			rid: stem.rid,
			belongRadical: stem.belongRadical
		};
	}
	flexCenter.call(this, avaliables, stems);
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
}

function decideWidths(stems, priority, tws) {
	const { ppem, uppx, strategy } = this;
	var tws = [];
	var areaLost = 0;
	var totalWidth = 0;
	for (var j = 0; j < stems.length; j++) {
		tws[j] = this.calculateWidthOfStem(stems[j].width, true);
		totalWidth += stems[j].width;
		areaLost += (stems[j].width / uppx - tws[j]) * (stems[j].xmax - stems[j].xmin);
	}
	// Coordinate widths
	var averageWidth = totalWidth / stems.length;
	var coordinateWidth = this.calculateWidthOfStem(averageWidth, true);
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
				if (tws[j] < this.WIDTH_GEAR_PROPER && areaLost > len / 2) {
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


function flexCenter(avaliables, stems) {
	const { upm, ppem, uppx } = this;
	// fix top and bottom stems
	for (var j = 0; j < stems.length; j++) {
		const avail = avaliables[j], stem = stems[j];
		if (!stem.hasGlyphStemBelow) {
			avail.high = Math.round(Math.max(
				avail.center,
				this.glyphBottom / uppx + avail.properWidth + (this.atGlyphBottom(stem) ? 0 : 1
				)));
		}
		if (!stem.hasGlyphStemAbove && !stem.diagLow) {
			// lock top
			avail.low = Math.round(avail.center);
		}
		if (this.atGlyphBottom(stem) && !avail.diagLow
			&& avail.high - avail.low <= 1
			&& avail.low <= this.glyphBottom / uppx + avail.properWidth + 0.1
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > this.strategy.STEM_SIDE_MIN_DESCENT / 3)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > this.strategy.STEM_SIDE_MIN_DESCENT / 3)) {
			// Lock the bottommost stroke
			avail.high -= 1;
			if (avail.high < avail.low) avail.high = avail.low;
		}
	}
	for (let s of avaliables) {
		if (s.diagLow && s.center >= this.glyphTop / uppx - 0.5) {
			s.center = xclamp(s.low, this.glyphTop / uppx - 1, s.center);
			s.softHigh = s.center;
		}
		if (s.diagHigh && s.center <= this.glyphBottom / uppx + 0.5) {
			s.center = xclamp(s.center, this.glyphBottom / uppx + 1, s.high);
			s.softLow = s.center;
		}
	}
}

function decideSymmetry() {
	const { avaliables, directOverlaps } = this;
	var sym = [];
	for (var j = 0; j < avaliables.length; j++) {
		sym[j] = [];
		for (var k = 0; k < j; k++) {
			sym[j][k] = !directOverlaps[j][k]
				&& !avaliables[j].diagHigh && !avaliables[k].diagHigh
				&& Math.abs(avaliables[j].y0 - avaliables[k].y0) < this.uppx / 3
				&& Math.abs(avaliables[j].y0 - avaliables[j].w0 - avaliables[k].y0 + avaliables[k].w0) < this.uppx / 3
				&& Math.abs(avaliables[j].length - avaliables[k].length) < this.uppx / 3
				&& (avaliables[j].hasGlyphStemAbove === avaliables[k].hasGlyphStemAbove)
				&& (avaliables[j].hasGlyphStemBelow === avaliables[k].hasGlyphStemBelow)
				&& (avaliables[j].hasSameRadicalStemAbove === avaliables[k].hasSameRadicalStemAbove)
				&& (avaliables[j].hasSameRadicalStemBelow === avaliables[k].hasSameRadicalStemBelow)
				&& (avaliables[j].atGlyphTop === avaliables[k].atGlyphTop)
				&& (avaliables[j].atGlyphBottom === avaliables[k].atGlyphBottom);
		}
	}
	return sym;
}

module.exports = Hinter;
