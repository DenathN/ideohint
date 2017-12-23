"use strict";

const HE = require("./hintingElement");
const { iphintedPositions, distHintedPositions } = require("./predictor");
const StemInstructionCombiner = require("./stem-instruction-combiner");

// Temporary disable them
const ENABLE_LINK_TO_TOP = true;
const ENABLE_LINK_TO_BOTTOM = true;

module.exports = function(boundary, sd, elements) {
	let tdis = 0;
	const { fpgmPadding, strategy, pmin, pmaxC, upm } = this;
	const { bottomStem, bottomAnchor, topStem, topAnchor } = boundary;

	this.talk(`\n\n/* !!IDH!! INTERMEDIATES */`);
	const ipAnchorZs = [];
	const linkTopZs = [];
	const linkBottomZs = [];
	const ipZs = [];
	for (let r of elements) {
		if (r.told) {
			//pass
		} else if (r.kind === HE.KEY_ITEM_STEM) {
			// pass
		} else {
			ipZs.push(r.ipz);
			r.told = true;
		}
	}

	const combiner = new StemInstructionCombiner(fpgmPadding);
	for (let r of elements) {
		if (r.told) continue;
		// ASSERT: r.kind === KEY_ITEM_STEM
		let attempts = [];

		if (ENABLE_LINK_TO_BOTTOM && topStem.pOrg - r.pOrg >= 2 * (r.pOrg - bottomStem.pOrg)) {
			attempts.push({
				to: linkBottomZs,
				addTDI: 6,
				pos0: distHintedPositions(bottomStem, r, upm, pmin, pmaxC)
			});
		}
		if (ENABLE_LINK_TO_TOP && 2 * (topStem.pOrg - r.pOrg) <= r.pOrg - bottomStem.pOrg) {
			attempts.push({
				to: linkTopZs,
				addTDI: 6,
				pos0: distHintedPositions(topStem, r, upm, pmin, pmaxC)
			});
		}

		// IP
		attempts.push({
			to: ipAnchorZs,
			addTDI: 3,
			pos0: iphintedPositions(bottomStem, r, topStem, pmin, pmaxC)
		});

		let bestCost = 0xffff;
		let bestG = null;
		let bestA = null;
		for (let a of attempts) {
			const g = this.encoder.encodeStem(r.stem, r.sid, sd, strategy, a.pos0, pmaxC);
			if (g.totalDeltaImpact + a.addTDI < bestCost) {
				bestG = g;
				bestA = a;
				bestCost = g.totalDeltaImpact + a.addTDI;
			}
		}

		bestA.to.push(r.ipz);
		combiner.add(bestG.parts);
		tdis += bestCost;
		r.hintedPositions = bestG.hintedPositions;
	}
	const ipks = [...ipZs, ...ipAnchorZs];
	if (ipks.length) {
		this.talk(`YInterpolate(${bottomAnchor.ipz},${ipks.join(",")},${topAnchor.ipz})`);
		tdis += 7;
	}
	for (let z of ipAnchorZs) {
		this.talk(`YAnchor(${z})`);
	}

	for (let z of linkTopZs) {
		this.talk(`YShift(${topStem.ipz},${z}) YAnchor(${z})`);
	}
	for (let z of linkBottomZs) {
		this.talk(`YShift(${bottomStem.ipz},${z}) YAnchor(${z})`);
	}

	this.talk(combiner.combine());
	return tdis;
};
