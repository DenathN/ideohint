"use strict";

const outlier = require("outlier");
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

function hint(gd, ppem, strg, options) {
	const hinter = new Hinter(strg, gd, ppem, options);
	if (!hinter.avails.length) return new HintDecision(hinter.xExpansion, [], false);
	const spInit = hinter.balance(hinter.decideInitHint(options.y0));
	const spNT = hinter.balance(hinter.decideInitHintNT(options.y0));
	// Y pass
	let initWidths = hinter.avails.map(a => a.properWidth);
	const spUncol = hinter.uncollide(spInit);
	// width pass
	const pass1Idv = choose(hinter, spNT, spUncol);
	let { y, w } = hinter.allocateWidth([...pass1Idv.gene]);

	// filter out outliers
	const otl = outlier(w);
	const avgw = Math.round(w.reduce((a, b) => a + b, 0) / w.length);
	let w1 = w.map((x, j) =>
		Math.min(options.maxStrokeWidths[j], otl.testOutlier(x) ? Math.max(x, avgw) : x)
	);

	// The width allocator may alter the initial width
	// do the second pass if necessary
	let doSecondPass = false;
	for (let j = 0; j < w1.length; j++) {
		if (y[j] !== pass1Idv.gene[j]) doSecondPass = true;
		if (w1[j] !== initWidths[j]) doSecondPass = true;
	}
	if (doSecondPass) {
		hinter.updateAvails([...w1], options);
		const spUncol1 = hinter.uncollide(hinter.balance(hinter.decideInitHint()));
		const pass2Idv = choose(
			hinter,
			hinter.balance([...y]),
			hinter.balance([...spNT]),
			spUncol1
		);
		const a = hinter.allocateWidth(pass2Idv.gene);
		y = a.y;
		w = a.w;
	}
	// results
	return new HintDecision(hinter.xExpansion, stemPositionToActions.call(hinter, y, w, gd.stems));
}
module.exports = hint;
