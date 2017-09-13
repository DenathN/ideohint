"use strict";

const roundings = require("../support/roundings");
const toF26D6P = roundings.toF26D6P;
const { decideDelta, decideDeltaShift } = require("./delta.js");
const toposort = require("toposort");
const product = require("../support/product");
const { xclamp } = require("../support/common");
const {
	ROUNDING_SEGMENTS,
	VTTTalkDeltaEncoder,
	AssemblyDeltaEncoder,
	VTTECompiler,
	VTTCall
} = require("./vtt/encoder");

const { getVTTAux, cvtIds, generateCVT, generateFPGM } = require("./vtt/vttenv");

function table(min, max, f) {
	let a = [];
	for (let j = min; j <= max; j++) {
		a[j] = f(j);
	}
	return a;
}

function sortIPSAs(calls) {
	let defs = [],
		edges = [];
	for (let c of calls) {
		if (c.length < 2) continue;
		if (c.length === 2) {
			edges.push(c);
			defs[c[1]] = c;
		} else {
			for (let m = 2; m < c.length; m++) {
				edges.push([c[0], c[m]], [c[1], c[m]]);
				defs[c[m]] = [c[0], c[1], c[m]];
			}
		}
	}
	for (let j = 0; j < defs.length; j++)
		if (defs[j] && defs[j].length > 2)
			for (let k = 0; k < defs.length; k++)
				if (defs[k] && defs[k].length === 2) {
					edges.push([j, k]);
				}
	try {
		let sorted = toposort(edges);
		return sorted.map(j => defs[j]).filter(c => c && c.length >= 2);
	} catch (e) {
		return calls;
	}
}

function collectIPSAs(calls) {
	calls = sortIPSAs(calls);
	// collect groups
	let groups = [];
	for (let c of calls) {
		if (c.length < 2) continue;
		if (!groups[groups.length - 1] || groups[groups.length - 1].isShift !== (c.length === 2)) {
			groups.push({
				isShift: c.length === 2,
				items: [c]
			});
		} else {
			groups[groups.length - 1].items.push(c);
		}
	}
	groups = groups.map(g => {
		if (g.isShift) {
			g.items = g.items.sort((a, b) => a[0] - b[0]);
		} else {
			g.items = g.items
				.map(c => (c[0] < c[1] ? c : [c[1], c[0], ...c.slice(2)]))
				.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
		}
		return g;
	});

	let answer = [];
	for (let g of groups) {
		let currentInstr = [];
		for (let c of g.items) {
			if (g.isShift) {
				answer.push(c.slice(0));
			} else {
				if (c[0] === currentInstr[0] && c[1] === currentInstr[1]) {
					currentInstr = currentInstr.concat(c.slice(2));
				} else {
					answer.push(currentInstr);
					currentInstr = c.slice(0);
				}
			}
		}
		if (currentInstr.length) answer.push(currentInstr);
	}

	return answer;
}

const KEY_ITEM_STEM = 1;
const KEY_ITEM_BOTTOM = 2;
const KEY_ITEM_TOP = 3;

function CoTalkBottomAnchor(zid, cvtID, deltas) {
	return () => `
/* !!IDH!! Bottom Anchor Kind Direct */
YAnchor(${zid},${cvtID})
${deltas || ""}`;
}
function CoTalkTopAnchor(zid, cvtID, cvtTopBotDistId, deltas) {
	return function(z) {
		if (z >= 0) {
			return `/* !!IDH!! Top Anchor Kind Linked */
YLink(${z},${zid},${cvtTopBotDistId})`;
		} else {
			return `
/* !!IDH!! Top Anchor Kind Direct */
YAnchor(${zid},${cvtID})
${deltas || ""}`;
		}
	};
}

const ABRefMethods = [
	{
		comment: "QUAD",
		findItems: candidates => {
			let bottomAnchor = null,
				bottomStem = null,
				topAnchor = null,
				topStem = null;
			for (let j = 0; j < candidates.length; j++) {
				if (!bottomAnchor && candidates[j].kind !== KEY_ITEM_STEM) {
					bottomAnchor = candidates[j];
				}
				if (!bottomStem && candidates[j].kind === KEY_ITEM_STEM) {
					bottomStem = candidates[j];
				}
				if (candidates[j].kind !== KEY_ITEM_STEM) {
					topAnchor = candidates[j];
				}
				if (candidates[j].kind === KEY_ITEM_STEM) {
					topStem = candidates[j];
				}
			}
			if (topAnchor && !topStem) topStem = topAnchor;
			if (!topAnchor && topStem) topAnchor = topStem;
			if (bottomAnchor && !bottomStem) bottomStem = bottomAnchor;
			if (!bottomAnchor && bottomStem) bottomAnchor = bottomStem;

			if (bottomAnchor && bottomStem && bottomAnchor.pOrg >= bottomStem.pOrg)
				bottomAnchor = bottomStem;
			if (topAnchor && topStem && topAnchor.pOrg <= topStem.pOrg) topAnchor = topStem;
			return { bottomAnchor, bottomStem, topAnchor, topStem };
		}
	},

	{
		comment: "DUAL",
		findItems: candidates => {
			let bottomAnchor = null,
				topAnchor = null;
			for (let j = 0; j < candidates.length; j++) {
				if (!bottomAnchor) {
					bottomAnchor = candidates[j];
				}
				topAnchor = candidates[j];
			}
			return { bottomAnchor, bottomStem: bottomAnchor, topAnchor, topStem: topAnchor };
		}
	}
];

const rfCombinations = [...product(ABRefMethods, [0, 1, 2], [0, 1, 2])];

function iphintedPositions(bottomStem, r, topStem, pmin, pmax) {
	return table(pmin, pmax, ppem => {
		const org_dist = r.pOrg - bottomStem.pOrg;
		const org_range = topStem.pOrg - bottomStem.pOrg;
		const cur_range = topStem.hintedPositions[ppem] - bottomStem.hintedPositions[ppem];
		return bottomStem.hintedPositions[ppem] + cur_range * org_dist / org_range;
	});
}

function distHintedPositions(rp0, r, upm, pmin, pmax) {
	return table(pmin, pmax, ppem => {
		const org_dist = r.pOrg - rp0.pOrg;
		if (org_dist > 0) {
			return rp0.hintedPositions[ppem] + roundings.rtg(org_dist, upm, ppem);
		} else {
			return rp0.hintedPositions[ppem] - roundings.rtg(-org_dist, upm, ppem);
		}
	});
}

function chooseTBPos0(stemKind, stem, cvtCutin, choices) {
	let chosen = choices[0];
	for (let c of choices)
		if (Math.abs(c.y - stem.pOrg) < Math.abs(chosen.y - stem.pOrg)) {
			chosen = c;
		}
	let { cvt, y, pos0s } = chosen;
	if (Math.abs(stem.pOrg - y) > cvtCutin) return null;

	return {
		posInstr: `/* !!IDH!! StemDef ${stem.sid} ${stemKind} ABSORB */\nYAnchor(${stem.ipz},${cvt})`,
		pos0s
	};
}

function ibpType(x) {
	if (typeof x === "stirng") return "str";
	if (x instanceof VTTCall) return "vttcall";
	return "unknown";
}

function flatten(ary) {
	var ret = [];
	for (var i = 0; i < ary.length; i++) {
		if (Array.isArray(ary[i])) {
			ret = ret.concat(flatten(ary[i]));
		} else {
			ret.push(ary[i]);
		}
	}
	return ret;
}

const ibpCombiner = {
	unknown: xs => xs.join("\n"),
	str: xs => xs.join("\n"),
	vttcall: (xs, fpgmPadding) => {
		const primaryInvokes = [...xs.map(x => x.forms)];
		if (primaryInvokes.length <= 1) return xs.join("\n");
		let arglist = flatten(primaryInvokes);
		if (!arglist.length) return "";
		if (arglist.length > 256) return xs.join("\n");
		if (arglist.length < 62) {
			return (
				xs
					.map(x => x.comment)
					.filter(x => !!x)
					.join("\n") +
				"\n" +
				`Call(0,${arglist},${fpgmPadding})`
			);
		} else {
			let asm = `ASM("CALL[],0,${arglist},${fpgmPadding}")`;
			if (asm.length < 800) {
				return (
					xs
						.map(x => x.comment)
						.filter(x => !!x)
						.join("\n") +
					"\n" +
					asm
				);
			} else {
				return xs.join("\n");
			}
		}
	}
};
function combineIBP(ibp, fpgmPadding) {
	let m = new Map();
	for (let x of ibp) {
		let ty = ibpType(x);
		if (!m.has(ty)) m.set(ty, []);
		m.get(ty).push(x);
	}
	let ans = "";
	for (let [k, v] of m) {
		if (v.length) ans += ibpCombiner[k](v, fpgmPadding) + "\n";
	}
	return ans;
}

// si : size-inpendent actions
// sd : size-dependent actions
// strategy : strategy object
// padding : CVT padding value, padding + 2 -> bottom anchor; padding + 1 -> top anchor
// fpgmPadding : FPGM padding
function produceVTTTalk(record, strategy, padding, fpgmPadding) {
	const sd = record.sd;
	const si = record.si;
	const pmin = record.pmin;
	const pmax = record.pmax;
	const upm = strategy.UPM;

	const {
		cvtZeroId,
		cvtTopId,
		cvtBottomId,
		cvtTopDId,
		cvtBottomDId,
		cvtTopBarId,
		cvtBottomBarId,
		cvtTopBotDistId,
		cvtTopBotDDistId,
		cvtCSW,
		cvtCSWD
	} = cvtIds(padding);

	const { yBotBar, yTopBar, yBotD, yTopD, canonicalSW, SWDs } = getVTTAux(strategy);

	const SWS = [
		{ width: canonicalSW, cvtid: cvtCSW },
		...SWDs.map((x, j) => ({ width: x, cvtid: cvtCSWD + j }))
	];

	let buf = "";
	function talk(s) {
		buf += s + "\n";
	}

	const ec = new VTTECompiler(
		fpgmPadding ? new AssemblyDeltaEncoder(fpgmPadding) : new VTTTalkDeltaEncoder()
	);

	//// Y
	// ip decider
	const hintedPositionsBot = table(pmin, pmax, ppem =>
		roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
	);
	const hintedPositionsTop0 = table(pmin, pmax, ppem =>
		roundings.rtg(strategy.BLUEZONE_TOP_CENTER, upm, ppem)
	);
	const hintedPositionsTop = table(
		pmin,
		pmax,
		ppem =>
			roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem) +
			roundings.rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
	);
	const hintedPositionsBotB = table(pmin, pmax, ppem => roundings.rtg(yBotBar, upm, ppem));
	const hintedPositionsTopB = table(pmin, pmax, ppem => roundings.rtg(yTopBar, upm, ppem));
	const hintedPositionsBotD = table(pmin, pmax, ppem => roundings.rtg(yBotD, upm, ppem));
	const hintedPositionsTopD = table(pmin, pmax, ppem => roundings.rtg(yTopD, upm, ppem));
	const hintedPositionsTopDLinked = table(
		pmin,
		pmax,
		ppem =>
			roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem) +
			roundings.rtg(yTopD - yBotD, upm, ppem)
	);
	let candidates = [];

	// Initialize candidates
	for (let z of si.blue.bottomZs) {
		if (Math.abs(z.y - yBotD) < Math.abs(z.y - strategy.BLUEZONE_BOTTOM_CENTER)) {
			candidates.push({
				ipz: z.id,
				told: false,
				pOrg: z.y,
				kind: KEY_ITEM_BOTTOM,
				talk: CoTalkBottomAnchor(
					z.id,
					cvtBottomDId,
					ec.encodeAnchor(
						z.id,
						hintedPositionsBotD,
						hintedPositionsBot,
						pmin,
						pmax,
						strategy
					)
				),
				hintedPositions: hintedPositionsBot
			});
		} else {
			candidates.push({
				ipz: z.id,
				told: false,
				pOrg: z.y,
				kind: KEY_ITEM_BOTTOM,
				talk: CoTalkBottomAnchor(z.id, cvtBottomId),
				hintedPositions: hintedPositionsBot
			});
		}
	}
	for (let z of si.blue.topZs) {
		if (Math.abs(z.y - yTopD) < Math.abs(z.y - strategy.BLUEZONE_TOP_CENTER)) {
			candidates.push({
				ipz: z.id,
				told: false,
				pOrg: z.y,
				kind: KEY_ITEM_TOP,
				talk: CoTalkTopAnchor(
					z.id,
					cvtTopDId,
					cvtTopBotDistId,
					ec.encodeAnchor(
						z.id,
						hintedPositionsTopD,
						hintedPositionsTop,
						pmin,
						pmax,
						strategy
					)
				),
				hintedPositions: hintedPositionsTop
			});
		} else {
			candidates.push({
				ipz: z.id,
				told: false,
				pOrg: z.y,
				kind: KEY_ITEM_TOP,
				talk: CoTalkTopAnchor(
					z.id,
					cvtTopId,
					cvtTopBotDistId,
					ec.encodeAnchor(
						z.id,
						hintedPositionsTop0,
						hintedPositionsTop,
						pmin,
						pmax,
						strategy
					)
				),
				hintedPositions: hintedPositionsTop
			});
		}
	}
	for (let sid = 0; sid < si.stems.length; sid++) {
		const s = si.stems[sid];
		candidates.push({
			ipz: s.posKey.id,
			told: false,
			pOrg: s.posKey.y,
			kind: KEY_ITEM_STEM,
			stem: s,
			sid: sid,
			hintedPositions: null
		});
	}
	candidates = candidates.sort((a, b) => a.pOrg - b.pOrg);

	/// Stems and Anchors
	/// We choose one best combination of methods from 18 combinations
	let bestTDI = 0xffff,
		bestTalk = "";
	for (let [refMethod, bsMethod, tsMethod] of rfCombinations) {
		let { bottomAnchor, bottomStem, topAnchor, topStem } = refMethod.findItems(candidates);
		if (!(topAnchor && bottomAnchor && topStem && bottomStem)) continue;
		// clear key items' status
		for (let r of candidates) r.told = false;
		// local talker
		let buf = "";
		let talk = s => {
			buf += s + "\n";
		};
		let tdis = 0;

		talk(`/* !!IDH!! REFMETHOD ${refMethod.comment} */`);

		/// Reference items
		// Bottom anchor reference
		let refBottomZ = -1;
		if (!bottomAnchor.told && bottomAnchor.kind !== KEY_ITEM_STEM) {
			// BKT must have a talk()
			talk(bottomAnchor.talk());
			bottomAnchor.told = true;
			refBottomZ = bottomAnchor.ipz;
		}
		// Top anchor reference
		if (!topAnchor.told && topAnchor.kind !== KEY_ITEM_STEM) {
			talk(topAnchor.talk(refBottomZ));
			topAnchor.told = true;
		}
		// Bottom stem reference
		if (!bottomStem.told && bottomStem.kind === KEY_ITEM_STEM) {
			const bsParams = [
				{
					posInstr: `/* !!IDH!! StemDef ${bottomStem.sid} BOTTOM Direct */\nYAnchor(${bottomStem.ipz})`,
					pos0s: null
				},
				chooseTBPos0("BOTTOM", bottomStem, upm / pmax, [
					{ cvt: cvtBottomBarId, y: yBotBar, pos0s: hintedPositionsBotB },
					{ cvt: cvtBottomDId, y: yBotD, pos0s: hintedPositionsBotD },
					{
						cvt: cvtBottomId,
						y: strategy.BLUEZONE_BOTTOM_CENTER,
						pos0s: hintedPositionsBot
					}
				]),
				!bottomAnchor.told
					? null
					: {
							posInstr: `/* !!IDH!! StemDef ${topStem.sid} BOTTOM Dist */\nYDist(${bottomAnchor.ipz},${bottomStem.ipz})`,
							pos0s: distHintedPositions(bottomAnchor, bottomStem, upm, pmin, pmax)
						}
			][bsMethod];
			if (!bsParams) continue;
			const { totalDeltaImpact: tdi, buf, hintedPositions } = ec.encodeStem(
				bottomStem.stem,
				bottomStem.sid,
				sd,
				strategy,
				bsParams.pos0s,
				SWS
			);
			talk(bsParams.posInstr);
			bottomStem.hintedPositions = hintedPositions;
			tdis += tdi;
			talk(buf);
			bottomStem.told = true;
		}

		// Top stem reference
		if (!topStem.told && topStem.kind === KEY_ITEM_STEM) {
			const tsParams = [
				{
					posInstr: `/* !!IDH!! StemDef ${topStem.sid} TOP Direct */\nYAnchor(${topStem.ipz})`,
					pos0s: null
				},
				chooseTBPos0("TOP", topStem, upm / pmax, [
					{ cvt: cvtTopBarId, y: yTopBar, pos0s: hintedPositionsTopB },
					{ cvt: cvtTopDId, y: yTopD, pos0s: hintedPositionsTopD },
					{
						cvt: cvtTopId,
						y: strategy.BLUEZONE_TOP_CENTER,
						pos0s: hintedPositionsTop0
					}
				]),
				topAnchor.told
					? {
							posInstr: `/* !!IDH!! StemDef ${topStem.sid} TOP Dist */\nYDist(${topAnchor.ipz},${topStem.ipz})`,
							pos0s: distHintedPositions(topAnchor, topStem, upm, pmin, pmax)
						}
					: null
			][tsMethod];
			if (!tsParams) continue;
			const { totalDeltaImpact: tdi, buf, hintedPositions } = ec.encodeStem(
				topStem.stem,
				topStem.sid,
				sd,
				strategy,
				tsParams.pos0s,
				SWS
			);
			talk(tsParams.posInstr);
			topStem.hintedPositions = hintedPositions;
			tdis += tdi;
			talk(buf);
			topStem.told = true;
		}

		/// Intermediate items
		talk(`\n\n/* !!IDH!! INTERMEDIATES */`);
		const ipAnchorZs = [];
		const ipZs = [];
		for (let r of candidates) {
			if (r.told) {
				//pass
			} else if (r.kind === KEY_ITEM_STEM) {
				if (r.pOrg > bottomStem.pOrg && r.pOrg < topStem.pOrg) {
					ipAnchorZs.push(r.ipz);
				}
			} else {
				ipZs.push(r.ipz);
				r.told = true;
			}
		}

		if (ipAnchorZs.length) {
			talk(`YIPAnchor(${bottomStem.ipz},${ipAnchorZs.join(",")},${topStem.ipz})`);
		}
		if (ipZs.length) {
			talk(`YInterpolate(${bottomAnchor.ipz},${ipZs.join(",")},${topAnchor.ipz})`);
		}

		let innerBufParts = [];
		for (let r of candidates) {
			if (r.told) continue;
			// ASSERT: r.kind === KEY_ITEM_STEM
			if (r.pOrg > bottomStem.pOrg && r.pOrg < topStem.pOrg) {
				const g = ec.encodeStem(
					r.stem,
					r.sid,
					sd,
					strategy,
					iphintedPositions(bottomStem, r, topStem, pmin, pmax),
					SWS
				);
				for (let p = 0; p < g.parts.length; p++) {
					if (!innerBufParts[p]) innerBufParts[p] = [];
					innerBufParts[p].push(g.parts[p]);
				}
				tdis += g.totalDeltaImpact;
			} else {
				// Should not happen
				talk(`/* !!IDH!! StemDef ${r.sid} DIRECT */`);
				talk(`YAnchor(${r.ipz})`);
				const g = ec.encodeStem(r.stem, r.sid, sd, strategy, null, SWS);
				for (let p = 0; p < g.parts.length; p++) {
					if (!innerBufParts[p]) innerBufParts[p] = [];
					innerBufParts[p].push(g.parts[p]);
				}
				tdis += g.totalDeltaImpact;
			}
		}
		for (let ibp of innerBufParts) {
			if (!ibp || !ibp.length) continue;
			talk(combineIBP(ibp, fpgmPadding));
		}

		if (tdis < bestTDI) {
			bestTalk = buf;
			bestTDI = tdis;
		}
	}
	talk(bestTalk);

	/// Diagonal alignments
	let diagAlignCalls = [];
	for (let da of si.diagAligns) {
		if (!da.zs.length) continue;
		// IP METHOD
		for (let z of da.zs) {
			diagAlignCalls.push([da.l, da.r, z]);
		}
		// DALIGN METHOD
		// talk(`XAnchor(${da.l})`);
		// talk(`XAnchor(${da.r})`);
		// talk(`DAlign(${da.l},${da.zs.join(",")},${da.r})`);
	}

	/// Interpolations and Shifts
	const calls = collectIPSAs([...diagAlignCalls, ...si.ipsacalls]);
	for (let c of calls) {
		if (!c || c.length < 2) continue;
		if (c.length >= 3) {
			// ip
			if (c[0] !== c[1]) talk(`YInterpolate(${c[0]},${c.slice(2).join(",")},${c[1]})`);
		} else {
			talk(`YShift(${c[0]},${c[1]})`);
		}
	}
	talk("Smooth()");
	return buf;
}

exports.talk = produceVTTTalk;
exports.generateCVT = generateCVT;
exports.generateFPGM = generateFPGM;
