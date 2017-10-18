"use strict";

const roundings = require("../../support/roundings");
const { lerp, xclamp, toVQ } = require("../../support/common");
const stemSpat = require("../../support/stem-spatial");

const decideAvails = require("./init/avail");
const decideWidths = require("./init/decide-widths");

const Individual = require("./uncollide/individual");
const uncollide = require("./uncollide");
const allocateWidth = require("./allocate-width");

function risefn(x) {
	return x * x * x * x * x * x;
}

class Hinter {
	constructor(strategy, fdefs, ppem) {
		//// STRATEGY SPECIFIC
		this.strategy = strategy;
		this.upm = strategy.UPM || 1000;
		this.ppem = ppem;
		this.prepareParameters();

		//// GLYPH SPECIFIC
		this.A = fdefs.collisionMatrices.alignment;
		this.C = fdefs.collisionMatrices.collision;
		this.S = fdefs.collisionMatrices.swap;
		this.P = fdefs.collisionMatrices.promixity;

		this.directOverlaps = fdefs.directOverlaps;
		this.strictOverlaps = fdefs.strictOverlaps;

		this.triplets = fdefs.triplets;
		this.strictTriplets = fdefs.strictTriplets;

		this.stats = fdefs.stats;

		//// CALCULATED
		this.tightness = this.getTightness(fdefs);
		this.nStems = fdefs.stems.length;
		const tws = this.decideWidths(fdefs.stems, fdefs.dominancePriority);
		this.avails = decideAvails.call(this, fdefs.stems, tws);
		this.symmetry = decideSymmetry.call(this);

		this.xExpansion = 1 + Math.round(toVQ(strategy.X_EXPAND, ppem)) / 100;
	}
	prepareParameters() {
		const { strategy, ppem } = this;
		this.uppx = this.upm / this.ppem;

		this.glyphTop =
			this.round(strategy.BLUEZONE_BOTTOM_CENTER) +
			this.round(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER);
		this.glyphBottom = this.round(strategy.BLUEZONE_BOTTOM_CENTER);
		this.glyphTopPixels = Math.round(this.glyphTop / this.uppx);
		this.glyphBottomPixels = Math.round(this.glyphBottom / this.uppx);
		this.BOTTOM_UNIFY_FORCE = toVQ(strategy.BOTTOM_UNIFY_FORCE, ppem) / 100;
		this.BOTTOM_UNIFY_FORCE_DIAG = toVQ(strategy.BOTTOM_UNIFY_FORCE_DIAG, ppem) / 100;

		// SWP
		this.CANONICAL_STEM_WIDTH = toVQ(strategy.CANONICAL_STEM_WIDTH, ppem);
		this.CANONICAL_STEM_WIDTH_DENSE = toVQ(strategy.CANONICAL_STEM_WIDTH_DENSE, ppem);

		this.SHRINK_THERSHOLD = strategy.SHRINK_THERSHOLD || 0.75;
		this.WIDTH_GEAR_PROPER = Math.round(this.CANONICAL_STEM_WIDTH / this.uppx);
		this.WIDTH_GEAR_MIN = Math.min(
			this.WIDTH_GEAR_PROPER,
			Math.round(this.CANONICAL_STEM_WIDTH_DENSE / this.uppx)
		);

		// FeatDP
		this.STEM_SIDE_MIN_RISE = Math.min(strategy.STEM_SIDE_MIN_RISE, this.uppx);
		this.STEM_SIDE_MIN_DIST_RISE = Math.min(strategy.STEM_SIDE_MIN_DIST_RISE);
		this.STEM_CENTER_MIN_RISE = Math.min(strategy.STEM_CENTER_MIN_RISE, this.uppx);
		this.STEM_SIDE_MIN_DESCENT = Math.min(strategy.STEM_SIDE_MIN_DESCENT, this.uppx);
		this.STEM_SIDE_MIN_DIST_DESCENT = Math.min(strategy.STEM_SIDE_MIN_DIST_DESCENT);
		this.STEM_CENTER_MIN_DESCENT = Math.min(strategy.STEM_CENTER_MIN_DESCENT, this.uppx);

		this.TOP_CUT = Math.round(toVQ(strategy.TOP_CUT, ppem)) * this.uppx;
		this.BOTTOM_CUT = Math.round(toVQ(strategy.BOTTOM_CUT, ppem)) * this.uppx;
		this.TOP_CUT_DIAGH = Math.round(toVQ(strategy.TOP_CUT_DIAGH, ppem)) * this.uppx;
		this.BOTTOM_CUT_DIAGL = Math.round(toVQ(strategy.BOTTOM_CUT_DIAGL, ppem)) * this.uppx;
		this.TOP_CUT_DIAG_DIST = Math.round(toVQ(strategy.TOP_CUT_DIAG_DIST, ppem)) * this.uppx;
		this.BOTTOM_CUT_DIAG_DIST =
			Math.round(toVQ(strategy.BOTTOM_CUT_DIAG_DIST, ppem)) * this.uppx;

		this.RISE = toVQ(strategy.RISE, ppem) / 200;
		this.SINK = toVQ(strategy.SINK, ppem) / 200;
		this.RISE_DIAGH = toVQ(strategy.RISE_DIAGH, ppem) / 200;
		this.SINK_DIAGL = toVQ(strategy.SINK_DIAGL, ppem) / 200;
		this.CHEBYSHEV_2 = toVQ(strategy.GRAVITY, ppem) / -200;
		this.CHEBYSHEV_3 = toVQ(strategy.CONCENTRATE, ppem) / 200;
		this.CHEBYSHEV_4 = toVQ(strategy.CHEBYSHEV_4, ppem) / -200;
		this.CHEBYSHEV_5 = toVQ(strategy.CHEBYSHEV_5, ppem) / 200;

		this.COEFF_OVERSEP = strategy.COEFF_OVERSEP;
	}
	getTightness(fdefs) {
		let d = 0xffff;
		for (let j = 0; j < fdefs.stems.length; j++)
			for (let k = 0; k < j; k++) {
				if (fdefs.directOverlaps[j][k]) {
					let d1 = fdefs.stems[j].y - fdefs.stems[j].width - fdefs.stems[k].y;
					if (d1 < d) d = d1;
				}
			}
		if (d < 1) d = 1;
		return this.upm / d;
	}
	round(x) {
		return roundings.rtg(x, this.upm, this.ppem);
	}
	atRadicalTop(stem) {
		return stemSpat.atRadicalTop(stem, this);
	}
	atGlyphTop(stem) {
		return stemSpat.atGlyphTop(stem, this);
	}
	atRadicalBottom(stem) {
		return stemSpat.atRadicalBottom(stem, this);
	}
	atGlyphBottom(stem) {
		return stemSpat.atGlyphBottom(stem, this);
	}
	atGlyphBottomMost(stem) {
		return stemSpat.atGlyphBottomMost(stem, this);
	}

	// Decide proper widths of stems globally
	decideWidths(stems, dominancePriority) {
		return decideWidths.call(this, stems, dominancePriority);
	}

	cheby(_x, extreme) {
		const x = _x * 2 - 1;
		const rise = this.RISE + (extreme ? this.RISE_DIAGH : 0);
		const sink = this.SINK + (extreme ? this.SINK_DIAGL : 0);
		const y = x + rise * risefn(_x) - sink * risefn(1 - _x);
		const dy =
			this.CHEBYSHEV_2 * (2 * x * x - 1) +
			this.CHEBYSHEV_3 * (4 * x * x * x - 3 * x) +
			this.CHEBYSHEV_4 * (8 * x * x * x * x - 8 * x * x + 1) +
			this.CHEBYSHEV_5 * (16 * x * x * x * x * x - 20 * x * x * x + 5 * x);
		const dy0 = this.CHEBYSHEV_2 - this.CHEBYSHEV_3 + this.CHEBYSHEV_4 - this.CHEBYSHEV_5;
		const dy1 = this.CHEBYSHEV_2 + this.CHEBYSHEV_3 + this.CHEBYSHEV_4 + this.CHEBYSHEV_5;
		const fdy = _x < 0 || _x > 1 ? 0 : dy - dy0 - (dy1 - dy0) * (x + 1) / 2;
		return (y + fdy + 1) / 2;
	}

	cy(y, w0, w, extreme) {
		const p =
			(y - w0 - this.strategy.BLUEZONE_BOTTOM_CENTER) /
			(this.strategy.BLUEZONE_TOP_CENTER - this.strategy.BLUEZONE_BOTTOM_CENTER - w0);
		return (
			w + this.glyphBottom + (this.glyphTop - this.glyphBottom - w) * this.cheby(p, extreme)
		);
	}

	shouldTwopass() {
		let d = 0xffff;
		for (let j = 0; j < this.nStems; j++)
			for (let k = 0; k < j; k++) {
				if (this.directOverlaps[j][k]) {
					let d1 =
						this.avails[j].y0 -
						this.avails[j].properWidth * this.uppx -
						this.avails[k].y0;
					if (d1 < d) d = d1;
				}
			}
		if (d < 1) d = 1;
		return d <= 1.5 * this.uppx;
	}

	decideInitHint() {
		const { avails } = this;
		return avails.map(s => s.center);
	}

	decideInitHintNT() {
		const { avails, uppx } = this;
		return avails.map(a =>
			xclamp(
				a.low,
				Math.round(
					lerp(a.y0, this.stats.ymin, this.stats.ymax, this.glyphBottom, this.glyphTop) /
						uppx
				),
				a.high
			)
		);
	}

	uncollide(y) {
		const { strategy, ppem } = this;
		const y1 = uncollide(
			y,
			this,
			xclamp(
				2,
				Math.round(this.nStems / strategy.STEADY_STAGES_X * this.nStems / ppem),
				strategy.STEADY_STAGES_MAX
			), // stages
			strategy.POPULATION_LIMIT * Math.max(1, this.nStems), // population
			true
		);
		if (this.shouldTwopass()) {
			const idvPass1 = this.createIndividual(y1);
			const y2 = uncollide(
				y1,
				this,
				xclamp(
					2,
					Math.round(this.nStems / strategy.STEADY_STAGES_X * this.nStems / ppem),
					strategy.STEADY_STAGES_MAX
				), // stages
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
}

function decideSymmetry() {
	const { avails, directOverlaps } = this;
	let sym = [];
	for (let j = 0; j < avails.length; j++) {
		sym[j] = [];
		for (let k = 0; k < j; k++) {
			sym[j][k] =
				!directOverlaps[j][k] &&
				!avails[j].diagHigh &&
				!avails[k].diagHigh &&
				Math.abs(avails[j].y0 - avails[k].y0) < this.uppx / 3 &&
				Math.abs(avails[j].y0 - avails[j].w0 - avails[k].y0 + avails[k].w0) <
					this.uppx / 3 &&
				Math.abs(avails[j].length - avails[k].length) < this.uppx / 3 &&
				avails[j].hasGlyphStemAbove === avails[k].hasGlyphStemAbove &&
				avails[j].hasGlyphStemBelow === avails[k].hasGlyphStemBelow &&
				avails[j].hasSameRadicalStemAbove === avails[k].hasSameRadicalStemAbove &&
				avails[j].hasSameRadicalStemBelow === avails[k].hasSameRadicalStemBelow &&
				avails[j].atGlyphTop === avails[k].atGlyphTop &&
				avails[j].atGlyphBottom === avails[k].atGlyphBottom;
		}
	}
	return sym;
}

module.exports = Hinter;
