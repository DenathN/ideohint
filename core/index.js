const { findStems } = require("../core/findstem");
const { extractFeature } = require("../core/extractfeature");
const hintForSize = require("../core/hinter");
const { parseOTD } = require("./otdParser");
const { xclamp } = require("../support/common");

exports.version = 10002;

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
	constructor(featData) {
		this.blue = featData.blueZoned;
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
				atRight: s.atRight
			};
		});
	}
}

exports.decideHints = function(featData, strategy) {
	let sd = [];
	let xExpansion = [];
	let d = 0xffff;
	for (let j = 0; j < featData.stems.length; j++) {
		for (let k = 0; k < j; k++) {
			if (!featData.directOverlaps[j][k]) continue;
			let d1 = featData.stems[j].y - featData.stems[j].width - featData.stems[k].y;
			if (d1 < d) d = d1;
		}
	}
	if (d < 1) d = 1;
	const cutoff = xclamp(
		strategy.PPEM_MIT,
		Math.round(strategy.UPM * strategy.SPARE_PIXLS / d),
		strategy.PPEM_MAX
	);

	for (let ppem = strategy.PPEM_MAX; ppem >= strategy.PPEM_MIN; ppem--) {
		const doSimpleHinting = strategy.FULLHINT ? false : ppem > cutoff;
		const actions = hintForSize(featData, ppem, strategy, doSimpleHinting);
		sd[ppem] = actions;
	}

	return {
		si: new SizeIndependentHints(featData),
		sd: sd,
		pmin: strategy.PPEM_MIN,
		pmax: strategy.PPEM_MAX
	};
};
