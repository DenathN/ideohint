"use strict";

const HE = require("./hintingElement");
const { iphintedPositions } = require("./predictor");
const StemInstructionCombiner = require("./stem-instruction-combiner");

module.exports = function(boundary, sd, elements) {
	let tdis = 0;
	const { fpgmPadding, strategy, pmin, pmax } = this;
	const { bottomStem, bottomAnchor, topStem, topAnchor } = boundary;

	this.talk(`\n\n/* !!IDH!! INTERMEDIATES */`);
	const ipAnchorZs = [];
	const ipZs = [];
	for (let r of elements) {
		if (r.told) {
			//pass
		} else if (r.kind === HE.KEY_ITEM_STEM) {
			if (r.pOrg > bottomStem.pOrg && r.pOrg < topStem.pOrg) {
				ipAnchorZs.push(r.ipz);
			}
		} else {
			ipZs.push(r.ipz);
			r.told = true;
		}
	}

	if (ipAnchorZs.length) {
		this.talk(`YIPAnchor(${bottomStem.ipz},${ipAnchorZs.join(",")},${topStem.ipz})`);
	}
	if (ipZs.length) {
		this.talk(`YInterpolate(${bottomAnchor.ipz},${ipZs.join(",")},${topAnchor.ipz})`);
	}

	const combiner = new StemInstructionCombiner(fpgmPadding);
	for (let r of elements) {
		if (r.told) continue;
		// ASSERT: r.kind === KEY_ITEM_STEM
		if (r.pOrg > bottomStem.pOrg && r.pOrg < topStem.pOrg) {
			const g = this.encoder.encodeStem(
				r.stem,
				r.sid,
				sd,
				strategy,
				iphintedPositions(bottomStem, r, topStem, pmin, pmax)
			);
			combiner.add(g.parts);
			tdis += g.totalDeltaImpact;
		} else {
			// Should not happen
			this.talk(`/* !!IDH!! StemDef ${r.sid} DIRECT */`);
			this.talk(`YAnchor(${r.ipz})`);
			const g = this.encoder.encodeStem(r.stem, r.sid, sd, strategy, null);
			combiner.add(g.parts);
			tdis += g.totalDeltaImpact;
		}
	}
	this.talk(combiner.combine());
	return tdis;
};
