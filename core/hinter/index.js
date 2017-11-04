"use strict";

const Hinter = require("./hinter");
const stemPositionToActions = require("./actions");

class HintDecision {
	constructor(x, y) {
		this.y = y;
		this.x = { expansion: x };
	}
}

function choose(hinter, first, ...sps) {
	let optimal = first;
	let idvOptimal = hinter.createIndividual(optimal);
	for (let sp of sps) {
		let idv = hinter.createIndividual(sp);
		if (idv.fitness > idvOptimal.fitness) {
			optimal = sp;
			idvOptimal = idv;
		}
	}
	return optimal;
}

function hint(gd, ppem, strg, y0) {
	const hinter = new Hinter(strg, gd, ppem);
	if (!hinter.avails.length) return new HintDecision(hinter.xExpansion, [], false);

	// W pass
	let passes = 0;
	let spInit = hinter.decideInitHintNT(y0);
	const spNT = spInit;
	do {
		const { w } = hinter.allocateWidth(spInit);
		hinter.updateAvails(
			hinter.avails.map(
				(a, j) =>
					a.atGlyphTop || a.atGlyphBottom
						? w[j]
						: Math.round(Math.max(a.properWidth, w[j]))
			)
		);
		spInit = hinter.decideInitHint();
		passes += 1;
	} while (passes < 4);
	// Y pass
	const spUncol = hinter.uncollide(spInit);

	// width pass
	const { y, w } = hinter.allocateWidth(choose(hinter, spNT, spUncol));
	// results
	return new HintDecision(hinter.xExpansion, stemPositionToActions.call(hinter, y, w, gd.stems));
}
module.exports = hint;
