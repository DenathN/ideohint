"use strict";

const HE = require("./hintingElement");
const { iphintedPositions, distHintedPositions } = require("./predictor");
const StemInstructionCombiner = require("./stem-instruction-combiner");

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

		attempts.push({
			to: linkBottomZs,
			addTDI: 4,
			pos0: distHintedPositions(bottomStem, r, upm, pmin, pmaxC)
		});
		attempts.push({
			to: linkTopZs,
			addTDI: 4,
			pos0: distHintedPositions(topStem, r, upm, pmin, pmaxC)
		});
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
		if (bestG) {
			bestA.to.push(r.ipz);
			combiner.add(bestG.parts);
			tdis += bestCost;
			r.hintedPositions = bestG.hintedPositions;
		} else {
			// Should not happen
			this.talk(`/* !!IDH!! StemDef ${r.sid} DIRECT */`);
			this.talk(`YAnchor(${r.ipz})`);
			const g = this.encoder.encodeStem(r.stem, r.sid, sd, strategy, null, pmaxC);
			combiner.add(g.parts);
			tdis += g.totalDeltaImpact;
			r.hintedPositions = g.hintedPositions;
		}
	}
	if (ipAnchorZs.length) {
		this.talk(`YIPAnchor(${bottomStem.ipz},${ipAnchorZs.join(",")},${topStem.ipz})`);
		tdis += 3;
	}
	for (let z of linkTopZs) {
		this.talk(`YShift(${topStem.ipz},${z}) YAnchor(${z})`);
		tdis += 2;
	}
	for (let z of linkBottomZs) {
		this.talk(`YShift(${bottomStem.ipz},${z}) YAnchor(${z})`);
		tdis += 2;
	}

	if (ipZs.length) {
		this.talk(`YInterpolate(${bottomAnchor.ipz},${ipZs.join(",")},${topAnchor.ipz})`);
		tdis += 3;
	}
	this.talk(combiner.combine());
	return tdis;
};
