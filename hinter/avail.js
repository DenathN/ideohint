"use strict";

const roundings = require("../support/roundings");
const { mix, lerp, xlerp, xclamp } = require("../support/common");

function decideMaxShift(y0, w0, ppem, tightness, strategy) {
	const minShiftLL = xclamp(3 / 4, lerp(ppem, 12, 24, 0.1 * tightness + 0.27, 3 / 4), 2);
	const maxShiftU = xclamp(
		minShiftLL,
		ppem / 16,
		xclamp(
			1,
			lerp(y0 - w0 / 2, strategy.BLUEZONE_TOP_CENTER, strategy.BLUEZONE_BOTTOM_CENTER, 1, 3),
			2
		)
	);
	const maxShiftD = xclamp(
		minShiftLL,
		ppem / 16,
		xclamp(
			1,
			lerp(y0 - w0 / 2, strategy.BLUEZONE_TOP_CENTER, strategy.BLUEZONE_BOTTOM_CENTER, 3, 1),
			2
		)
	);
	return [maxShiftD, maxShiftU];
}

class Avail {
	constructor(env, stem, tw) {
		const { upm, ppem, uppx, strategy, tightness } = env;
		const Y_UPTHIRD = mix(strategy.BLUEZONE_BOTTOM_CENTER, strategy.BLUEZONE_TOP_CENTER, 2 / 3);
		const Y_DOWNTHIRD = mix(
			strategy.BLUEZONE_BOTTOM_CENTER,
			strategy.BLUEZONE_TOP_CENTER,
			1 / 3
		);
		const y0 = stem.y,
			w0 = stem.width,
			w = tw * uppx;
		this.atGlyphTop = env.atGlyphTop(stem);
		this.atGlyphBottom = env.atGlyphBottom(stem);
		// The bottom limit of a stem
		let lowlimit =
			env.glyphBottom +
			w +
			Math.max(
				0,
				stem.diagLow
					? env.BOTTOM_CUT_DIAGL
					: stem.diagHigh
						? env.BOTTOM_CUT_DIAGL + env.BOTTOM_CUT_DIAG_DIST
						: env.BOTTOM_CUT,
				this.atGlyphBottom && !stem.diagHigh ? 0 : uppx
			);
		let fold = false;
		// Add additional space below strokes with a fold under it.
		if (stem.hasGlyphFoldBelow && !stem.hasGlyphStemBelow) {
			lowlimit = Math.max(
				lowlimit,
				env.glyphBottom +
					Math.max(2, env.WIDTH_GEAR_PROPER + 1) * uppx +
					env.WIDTH_GEAR_PROPER * uppx
			);
			fold = true;
		} else if (stem.hasGlyphSideFoldBelow && !stem.hasGlyphStemBelow) {
			lowlimit = Math.max(
				lowlimit,
				env.glyphBottom +
					Math.max(env.WIDTH_GEAR_PROPER + 2, env.WIDTH_GEAR_PROPER * 2) * uppx
			);
			fold = true;
		}

		// The top limit of a stem ('s upper edge)
		let highlimit =
			env.glyphTop -
			Math.max(
				0,
				// cut part
				stem.diagHigh
					? env.TOP_CUT_DIAGH
					: stem.diagLow ? env.TOP_CUT_DIAGH + env.TOP_CUT_DIAG_DIST : env.TOP_CUT,
				// spatial part
				this.atGlyphTop ? 0 : uppx
			);

		if (stem.hasEntireContourAbove) {
			highlimit = Math.min(env.glyphTop - 2 * uppx, highlimit);
		}

		const center0 = env.cy(
			y0,
			w0,
			w,
			(this.atGlyphTop && stem.diagHigh) || (this.atGlyphBottom && stem.diagLow),
			stem.posKeyAtTop
		);
		const [maxShiftD, maxShiftU] = decideMaxShift(y0, w0, ppem, tightness, strategy);
		const lowlimitW = Math.max(env.glyphBottom + w, tw > 1 ? lowlimit - uppx : lowlimit);
		const lowW = xclamp(
			lowlimitW,
			env.round(center0 - Math.max(1, maxShiftD) * uppx),
			highlimit
		);
		const highW = xclamp(
			lowlimitW,
			env.round(center0 + Math.max(1, maxShiftU) * uppx),
			highlimit
		);
		const lowP = xclamp(lowlimit, env.round(center0 - maxShiftD / 2 * uppx), highlimit);
		const highP = xclamp(lowlimit, env.round(center0 + maxShiftU / 2 * uppx), highlimit);
		const low = xclamp(lowlimit, env.round(center0 - maxShiftD * uppx), highlimit);
		const high = xclamp(lowlimit, env.round(center0 + maxShiftU * uppx), highlimit);
		const center = xclamp(low, center0, high);

		const ablationCoeff =
			env.atGlyphTop(stem) || env.atGlyphBottom(stem)
				? env.strategy.ABLATION_GLYPH_HARD_EDGE
				: !stem.hasGlyphStemAbove || !stem.hasGlyphStemBelow
					? env.strategy.ABLATION_GLYPH_EDGE
					: !stem.hasSameRadicalStemAbove || !stem.hasSameRadicalStemBelow
						? env.strategy.ABLATION_RADICAL_EDGE
						: env.strategy.ABLATION_IN_RADICAL;

		// limit of the stroke's y, when positioning, in pixels
		this.low = Math.round(low / uppx);
		this.high = Math.round(high / uppx);
		// limit of the stroke's y, when width allocating, in pixels
		this.lowW = Math.round(lowW / uppx);
		this.highW = Math.round(highW / uppx);
		// limit of the stroke's y, when width allocating's pushing pass, in pixels
		this.lowP = Math.round(lowP / uppx);
		this.highP = Math.round(highP / uppx);
		// soft high/low limits, affects ablation potential
		this.softLow = Math.round(low / uppx);
		this.softHigh = Math.round(high / uppx);
		// its proper width, in pixels
		this.properWidth = tw;
		// its proper position, in pixels
		this.center = center / uppx;
		this.ablationCoeff = ablationCoeff / uppx * (1 + 0.5 * (stem.xmax - stem.xmin) / upm);
		// original position and width
		this.y0 = y0;
		this.w0 = w0;
		this.y0px = y0 / uppx;
		this.w0px = w0 / uppx;
		this.xmin = stem.xmin;
		this.xmax = stem.xmax;
		this.length = stem.xmax - stem.xmin;
		// spatial relationships
		this.atGlyphTop = env.atGlyphTop(stem);
		this.atGlyphBottom = env.atGlyphBottom(stem);
		this.hasGlyphStemAbove = stem.hasGlyphStemAbove;
		this.hasGlyphStemBelow = stem.hasGlyphStemBelow;
		this.hasSameRadicalStemAbove = stem.hasSameRadicalStemAbove;
		this.hasSameRadicalStemBelow = stem.hasSameRadicalStemBelow;
		this.hasFoldBelow = fold;
		this.posKeyAtTop = stem.posKeyAtTop;
		this.diagLow = stem.diagLow;
		this.diagHigh = stem.diagHigh;
		this.rid = stem.rid;
		this.belongRadical = stem.belongRadical;
	}
}

/**
 * Adjust avail list to unify top/bottom features
 * @param {*} avails 
 * @param {*} stems 
 */
function adjustAvails(avails, stems) {
	const { upm, ppem, uppx } = this;
	const topPx = this.glyphTop / uppx;
	const bottomPx = this.glyphBottom / uppx;
	// fix top and bottom stems
	for (let j = 0; j < stems.length; j++) {
		const avail = avails[j],
			stem = stems[j];
		if (!stem.hasGlyphStemBelow) {
			avail.high = Math.round(
				Math.max(
					avail.center,
					bottomPx + avail.properWidth + (this.atGlyphBottom(stem) ? 0 : 1)
				)
			);
		}
		if (!stem.hasGlyphStemAbove && !stem.diagLow) {
			// lock top
			avail.low = Math.round(avail.center);
		}

		if (this.atGlyphBottomMost(stem)) {
			// Push bottommost stroke down to unify bottom features.
			// This unifies bottom features to make the text more "aligned".
			const bot = avail.high - avail.properWidth;
			const force =
				stem.diagHigh || stem.diagLow
					? this.BOTTOM_UNIFY_FORCE_DIAG
					: this.BOTTOM_UNIFY_FORCE;
			const bot1 =
				topPx - (topPx - bot) * (topPx - bottomPx - force) / (topPx - bottomPx - force * 2);
			avail.high = bot1 + avail.properWidth;
			if (avail.high < avail.low) avail.high = avail.low;
		}
	}

	for (let s of avails) {
		if (s.diagLow && s.center >= topPx - 0.5) {
			s.center = xclamp(s.low, topPx - 1, s.center);
			s.softHigh = s.center;
		}
		if (s.diagHigh && s.center <= bottomPx + 0.5) {
			s.center = xclamp(s.center, bottomPx + 1, s.high);
			s.softLow = s.center;
		}
	}
}

function decideAvails(stems, tws) {
	const { upm, ppem, uppx, strategy, tightness } = this;
	let avails = [];
	// decide avails
	for (let j = 0; j < stems.length; j++) {
		avails[j] = new Avail(this, stems[j], tws[j]);
	}
	// unify top/bottom features
	adjustAvails.call(this, avails, stems);
	// get soft high/low limit for diggonals
	for (let j = 0; j < stems.length; j++) {
		if (avails[j].diagLow) {
			avails[j].softHigh = avails[j].center;
		}
		if (avails[j].diagHigh) {
			avails[j].softLow = avails[j].center;
		}
	}
	// calculate proportion for ablation calculation
	for (let j = 0; j < stems.length; j++) {
		avails[j].proportion =
			(avails[j].center - avails[0].center) /
				(avails[avails.length - 1].center - avails[0].center) || 0;
	}
	return avails;
}

module.exports = decideAvails;
