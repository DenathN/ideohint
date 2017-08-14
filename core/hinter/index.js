"use strict";

const Hinter = require("./hinter");
const stemPositionToActions = require("./actions");

class HintDecision {
	constructor(x, y, s) {
		this.y = y;
		this.x = { expansion: x };
		this.didSimpleHinting = s;
	}
}

function hint(gd, ppem, strg, doSimpleHinting) {
	const hinter = new Hinter(strg, gd, ppem);
	if (!hinter.avails.length) return new HintDecision(hinter.xExpansion, [], false);

	// position pass
	let sp = null;
	const spInit = hinter.decideInitHint();
	const spNT = hinter.decideInitHintNT();
	if (doSimpleHinting) {
		const idvInit = hinter.createIndividual(spInit);
		const idvNT = hinter.createIndividual(spNT);
		sp = idvNT.fitness > idvInit.fitness ? spNT : spInit;
	} else {
		const idvNT = hinter.createIndividual(spNT);
		const spUncol = hinter.uncollide(spInit);
		const idvUncol = hinter.createIndividual(spUncol);
		sp = idvNT.fitness >= idvUncol.fitness ? spNT : spUncol;
	}

	// width pass
	const { y, w } = hinter.allocateWidth(sp);
	// results
	return new HintDecision(
		hinter.xExpansion,
		stemPositionToActions.call(hinter, y, w, gd.stems),
		doSimpleHinting
	);
}
module.exports = hint;
