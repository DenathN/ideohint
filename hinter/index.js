"use strict";

const Hinter = require("./init");
const { lerp, xlerp, xclamp } = require("../support/common");
const stemPositionToActions = require("./actions");

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
	return ipsacalls;
}
function slicelast(x) {
	return x.slice(0, -1);
}

function hint(gd, ppem, strg, tbonly) {
	const hinter = new Hinter(strg, gd, ppem);
	if (!hinter.avaliables.length) return { y: [], x: { expand: hinter.X_EXPAND } };

	let sp = null;

	const spInit = hinter.decideInitHint();
	const spNT = hinter.decideInitHintNT();
	if (tbonly) {
		const idvInit = hinter.createIndividual(spInit);
		const idvNT = hinter.createIndividual(spNT);
		sp = idvNT.fitness > idvInit.fitness ? spNT : spInit;
	} else {
		const idvNT = hinter.createIndividual(spNT);
		const spUncol = hinter.uncollide(spInit);
		const idvUncol = hinter.createIndividual(spUncol);
		sp = idvNT.fitness >= idvUncol.fitness ? spNT : spUncol;
	}

	const { y, w } = hinter.allocateWidth(sp);
	return {
		y: stemPositionToActions.call(hinter, y, w, gd.stems),
		x: { expand: hinter.xExpand }
	};
}
exports.hint = hint;

exports.hintAllSize = function(featData, strategy) {
	let stemActions = [];
	let xExpansion = [];
	let d = 0xffff;
	for (let j = 0; j < featData.stems.length; j++)
		for (let k = 0; k < j; k++) {
			if (featData.directOverlaps[j][k]) {
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
		const uppx = strategy.UPM / ppem;
		const actions = hint(featData, ppem, strategy, ppem > cutoff);
		stemActions[ppem] = actions.y;
		if (ppem > cutoff) {
			for (let j = 1; j < stemActions[ppem].length - 1; j++) {
				if (featData.stems[j].rid && featData.stems[j].rid === featData.stems[0].rid) {
					continue;
				}
				if (
					featData.stems[j].rid &&
					featData.stems[j].rid === featData.stems[featData.stems.length - 1].rid
				) {
					continue;
				}
				stemActions[ppem][j] = null;
			}
		}
		xExpansion[ppem] = actions.x.expand;
	}

	let sideIndependent = {
		blue: featData.blueZoned,
		ipsacalls: getIpsaCalls(featData),
		diagAligns: featData.diagAligns,
		xIP: featData.xIP,
		xExpansion: xExpansion,
		stems: featData.stems.map(function(s) {
			return {
				posKeyAtTop: s.posKeyAtTop,
				posKey: s.posKey,
				advKey: s.advKey,
				posAlign: s.posAlign,
				advAlign: s.advAlign,
				diagHigh: s.diagHigh,
				diagLow: s.diagLow,
				slope: s.slope
			};
		})
	};
	return {
		si: sideIndependent,
		sd: stemActions,
		pmin: strategy.PPEM_MIN,
		pmax: strategy.PPEM_MAX
	};
};
