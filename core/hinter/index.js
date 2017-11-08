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
	let idvOptimal = hinter.createIndividual(optimal, false);
	for (let sp of sps) {
		let idv = hinter.createIndividual(sp, false);
		if (idv.compare(idvOptimal) > 0) {
			optimal = sp;
			idvOptimal = idv;
		}
	}
	return idvOptimal;
}

function hint(gd, ppem, strg, y0) {
	const hinter = new Hinter(strg, gd, ppem);
	if (!hinter.avails.length) return new HintDecision(hinter.xExpansion, [], false);

	const spInit = hinter.balance(hinter.decideInitHint(y0));
	const spNT = hinter.balance(hinter.decideInitHintNT(y0));

	// Y pass
	let initWidths = hinter.avails.map(a => a.properWidth);
	const spUncol = hinter.uncollide(spInit);
	// width pass
	const pass1Idv = choose(hinter, spNT, spUncol);
	let { y, w } = hinter.allocateWidth(pass1Idv.gene);

	// The width allocator may alter the initial width
	// do the second pass if necessary
	let doSecondPass = false;
	for (let j = 0; j < w.length; j++) {
		if (w[j] !== initWidths[j]) doSecondPass = true;
	}
	if (doSecondPass) {
		hinter.updateAvails([...w]);
		const spUncol1 = hinter.uncollide(hinter.decideInitHint());
		const pass2Idv = choose(hinter, y, spNT, spUncol1);
		if (pass2Idv.better(pass1Idv)) {
			const a = hinter.allocateWidth(pass2Idv.gene);
			y = a.y;
			w = a.w;
		}
	}
	// results
	return new HintDecision(hinter.xExpansion, stemPositionToActions.call(hinter, y, w, gd.stems));
}
module.exports = hint;
