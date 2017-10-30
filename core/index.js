"use strict";

const { findStems } = require("../core/findstem");
const { extractFeature } = require("../core/extractfeature");
const hintForSize = require("../core/hinter");
const { parseOTD } = require("./otdParser");
const roundings = require("../support/roundings");

exports.version = 10073;

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
	for (let ppem = strategy.PPEM_MAX; ppem >= strategy.PPEM_MIN; ppem--) {
		const actions = hintForSize(featData, ppem, strategy, initialY);
		sd[ppem] = actions;

		// update initialY
		const [bottomThis, topThis] = topbotOf(strategy, upm, ppem);
		const [bottomThat, topThat] = topbotOf(strategy, upm, ppem - 1);
		const scale = (ppem - 1) / ppem;

		initialY = actions.y.map(function(a) {
			const y = a[0];
			const w = a[1];
			const w1 = Math.round(w * scale);
			const spaceBelow = y - w - bottomThis,
				spaceAbove = topThis - y;
			if (spaceBelow < spaceAbove) {
				const spaceBelow1 =
					(topThat - bottomThat - w1) * spaceBelow / (spaceBelow + spaceAbove);
				if (spaceBelow > 1 / 2) {
					return Math.min(
						topThat,
						bottomThat + Math.max(1, Math.round(spaceBelow1)) + w1
					);
				} else {
					return Math.min(
						topThat,
						bottomThat + Math.max(0, Math.round(spaceBelow1)) + w1
					);
				}
			} else {
				const spaceAbove1 =
					(topThat - bottomThat - w1) * spaceAbove / (spaceBelow + spaceAbove);
				if (spaceAbove > 1 / 2) {
					return Math.min(topThat, topThat - Math.max(1, Math.round(spaceAbove1)));
				} else {
					return Math.min(topThat, topThat - Math.max(0, Math.round(spaceAbove1)));
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
