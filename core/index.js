"use strict";

const { findStems } = require("../core/findstem");
const { extractFeature } = require("../core/extractfeature");
const hintForSize = require("../core/hinter");
const { parseOTD } = require("./otdParser");
const { xclamp, toVQ } = require("../support/common");
const roundings = require("../support/roundings");

exports.version = 10914;

exports.hintSingleGlyph = function(contours, strategy) {
	return exports.decideHints(
		exports.extractFeature(exports.parseOTD(contours), strategy),
		strategy
	);
};
exports.parseOTD = function(contours) {
	return parseOTD(contours);
};
exports.extractFeature = function(g, strategy) {
	return extractFeature(findStems(g, strategy), strategy);
};

// all-size hinter

function by_rp(a, b) {
	return a[0] - b[0] || a[1] - b[1];
}
function getIpsaCalls(glyph) {
	let ip = [];
	let sa = [];
	for (let j = 0; j < glyph.interpolations.length; j++) {
		if (!ip[glyph.interpolations[j][3]]) ip[glyph.interpolations[j][3]] = [];
		ip[glyph.interpolations[j][3]].push(glyph.interpolations[j]);
	}
	for (let j = 0; j < glyph.shortAbsorptions.length; j++) {
		if (!sa[glyph.shortAbsorptions[j][2]]) sa[glyph.shortAbsorptions[j][2]] = [];
		sa[glyph.shortAbsorptions[j][2]].push(glyph.shortAbsorptions[j]);
	}
	let ipsacalls = [];
	let maxpri = Math.max(ip.length - 1, sa.length - 1);
	for (let j = maxpri; j >= 0; j--) {
		ipsacalls = ipsacalls.concat(
			ip[j] ? ip[j].sort(by_rp).map(slicelast) : [],
			sa[j] ? sa[j].sort(by_rp).map(slicelast) : []
		);
	}
	return ipsacalls.filter(x => !!x);
}
function slicelast(x) {
	return x.slice(0, -1);
}

class SizeIndependentHints {
	constructor(featData, strategy) {
		this.upm = strategy.UPM;
		this.blue = featData.blueZoned;
		this.blue.topPos = strategy.BLUEZONE_TOP_CENTER;
		this.blue.bottomPos = strategy.BLUEZONE_BOTTOM_CENTER;
		this.ipsacalls = getIpsaCalls(featData);
		this.diagAligns = featData.diagAligns;
		this.xIP = featData.xIP;
		this.overlaps = featData.overlaps;
		this.directOverlaps = featData.directOverlaps;
		this.stems = featData.stems.map(function(s) {
			return {
				posKeyAtTop: s.posKeyAtTop,
				posKey: s.posKey,
				advKey: s.advKey,
				posAlign: s.posAlign,
				advAlign: s.advAlign,
				diagHigh: s.diagHigh,
				diagLow: s.diagLow,
				slope: s.slope,
				rid: s.rid,
				atLeft: s.atLeft,
				atRight: s.atRight,
				xmin: s.xmin,
				xmax: s.xmax,
				hasGlyphStemBelow: s.hasGlyphStemBelow,
				hasGlyphFoldBelow: s.hasGlyphFoldBelow,
				hasGlyphSideFoldBelow: s.hasGlyphSideFoldBelow,
				hasGlyphStemAbove: s.hasGlyphStemAbove,
				hasGlyphFoldAbove: s.hasGlyphFoldAbove
			};
		});
	}
}

function topbotOf(strategy, upm, ppem) {
	const uppx = upm / ppem;
	const b = Math.round(roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem) / uppx);
	const t =
		b +
		Math.round(
			roundings.rtg(
				strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER,
				upm,
				ppem
			) / uppx
		);
	return [b, t];
}

exports.decideHints = function(featData, strategy) {
	const upm = strategy.UPM;
	let sd = [];

	let initialY = null;
	let initialRanges = null;
	for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
		const actions = hintForSize(featData, ppem, strategy, initialY, initialRanges);
		sd[ppem] = actions;

		// update initialY
		const thatPPEM = ppem + 1;
		const [bottomThis, topThis] = topbotOf(strategy, upm, ppem);
		const [bottomThat, topThat] = topbotOf(strategy, upm, thatPPEM);
		initialRanges = actions.y.map(([y, w], j) => [
			featData.stems[j].diagHigh ? (y - w - bottomThis > 0 ? 1 : 0) : y - w - bottomThis,
			featData.stems[j].diagLow ? (topThis - y > 0 ? 1 : 0) : topThis - y
		]);

		initialY = actions.y.map(function(a) {
			const y = a[0];
			const w = a[1];
			const w1 = Math.round(
				w *
					Math.max(
						1,
						Math.round(toVQ(strategy.CANONICAL_STEM_WIDTH, thatPPEM) / (upm / thatPPEM))
					) /
					Math.max(
						1,
						Math.round(toVQ(strategy.CANONICAL_STEM_WIDTH, ppem) / (upm / ppem))
					)
			);
			const spaceBelow = y - w - bottomThis,
				spaceAbove = topThis - y;
			if (spaceBelow < spaceAbove) {
				const spaceBelow1 =
					spaceBelow * (topThat - bottomThat - w1) / (spaceBelow + spaceAbove);
				if (spaceBelow > 1 / 2) {
					return xclamp(
						bottomThat,
						bottomThat + Math.max(1, Math.round(spaceBelow1)) + w1,
						topThat
					);
				} else {
					return xclamp(
						bottomThat,
						bottomThat + Math.max(0, Math.round(spaceBelow1)) + w1,
						topThat
					);
				}
			} else {
				const spaceAbove1 =
					spaceAbove * (topThat - bottomThat - w1) / (spaceBelow + spaceAbove);
				if (spaceAbove > 1 / 2) {
					return xclamp(
						bottomThat,
						topThat - Math.max(1, Math.round(spaceAbove1)),
						topThat
					);
				} else {
					return xclamp(
						bottomThat,
						topThat - Math.max(0, Math.round(spaceAbove1)),
						topThat
					);
				}
			}
		});
	}

	return {
		si: new SizeIndependentHints(featData, strategy),
		sd: sd,
		pmin: strategy.PPEM_MIN,
		pmax: strategy.PPEM_MAX
	};
};
