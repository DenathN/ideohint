"use strict";

const roundings = require("../support/roundings");
const toF26D6P = roundings.toF26D6P;
const { decideDelta, decideDeltaShift } = require("./delta.js");
const { getVTTAux } = require("./cvt");
const toposort = require("toposort");
const product = require("../support/product");

const ROUNDING_SEGMENTS = 8;

function showF26D6(x) {
	return Math.round(x) + "+" + Math.round(64 * (x - Math.round(x))) + "/64";
}

function formatdelta(delta) {
	if (delta > 8) return formatdelta(8);
	if (delta < -8) return formatdelta(-8);
	let u = Math.round(delta * ROUNDING_SEGMENTS);
	let d = ROUNDING_SEGMENTS;
	while (!(u % 2) && !(d % 2) && d > 1) {
		(u /= 2), (d /= 2);
	}
	if (d > 1) {
		return u + "/" + d;
	} else {
		return "" + u;
	}
}

function encodeDelta(quantity, _ppems) {
	const ppems = [..._ppems.sort((a, b) => a - b), 0];
	let ppemstart = 0,
		ppemend = 0;
	let buf = [];
	for (let ppem of ppems) {
		if (ppem === ppemend + 1) {
			ppemend += 1;
		} else {
			if (ppemstart > 0) {
				buf.push(ppemend > ppemstart ? ppemstart + ".." + ppemend : "" + ppemstart);
			}
			ppemstart = ppemend = ppem;
		}
	}
	return quantity + "@" + buf.join(";");
}

function deltaDataOf(deltas) {
	let deltaData = {};
	for (let { delta, ppem } of deltas) {
		let quantity = formatdelta(delta);
		if (!deltaData[quantity]) deltaData[quantity] = [];
		deltaData[quantity].push(ppem);
	}
	const keys = Object.keys(deltaData);
	return { keys, deltaData };
}

function estimateDeltaImpact(d) {
	// impact caused by DLTP[]
	let impact = 0;
	// impact caused by SDS[]
	let sdsImpact = 0;
	// encoding bytes
	for (let dr of d) {
		let dq = Math.ceil(Math.abs(dr.delta));
		impact += 2 * dq; // two bytes for each entry
		if (dq > 1) sdsImpact = 4; // having a delta greater than one pixel would cause a SDS[]
	}
	const deltas = d.filter(x => x.delta);
	const { keys } = deltaDataOf(deltas);
	impact += keys.length * 2;
	return impact + sdsImpact;
}

function sanityDelta(z, d, tag) {
	var deltas = d.filter(x => x.delta);
	if (!deltas.length) return "";

	const { deltaData, keys } = deltaDataOf(deltas);
	if (!keys.length) return "";
	const deltaInstBody = keys.map(k => encodeDelta(k, deltaData[k])).join(",");
	return `${tag || "YDelta"}(${z},${deltaInstBody})`;
}

function encodeAnchor(z, ref, chosen, pmin, pmax, strategy) {
	const upm = strategy.UPM;
	let deltas = [];
	for (let ppem = pmin; ppem <= pmax; ppem++) {
		deltas.push({
			ppem,
			delta:
				decideDelta(ROUNDING_SEGMENTS, ref[ppem], chosen[ppem], upm, ppem) /
				ROUNDING_SEGMENTS
		});
	}
	return sanityDelta(z, deltas);
}

function standardAdvance(zpos, zadv, strategy) {
	if (strategy.SIGNIFICANT_LINK_ARROW) {
		return `YNoRound(${zadv})
YDist(${zpos},${zadv})`;
	} else {
		return `YShift(${zpos},${zadv}) /* !IMPORTANT */`;
	}
}

function SWAdvance(cvt) {
	return function(zpos, zadv) {
		return `YNoRound(${zadv})
YLink(${zpos},${zadv},${cvt})`;
	};
}

function clampAdvDelta(sign, isStrict, isLess, delta) {
	if (!delta) return 0;
	const willExpand = sign > 0 === delta < 0;
	if (Math.abs(delta) < 1.5 && (!isStrict || willExpand === isLess)) {
		return 0;
	} else {
		return delta / ROUNDING_SEGMENTS;
	}
}

function encodeStem(s, sid, sd, strategy, pos0s, sws, yMoves) {
	let buf = "";
	const upm = strategy.UPM;
	function talk(s) {
		buf += s + "\n";
	}

	yMoves = yMoves || [];

	let deltaPos = [];
	let hintedPositions = [];
	let totalDeltaImpact = 0;

	const wsrc = s.posKeyAtTop
		? s.posKey.y - s.advKey.y + (s.advKey.x - s.posKey.x) * s.slope
		: s.advKey.y - s.posKey.y + (s.posKey.x - s.advKey.x) * s.slope;
	const advDeltaGroups = [
		{ wsrc, totalDelta: 0, deltas: [], fn: standardAdvance },
		...sws
			.map(s => ({ wsrc: s.width, totalDelta: 0, deltas: [], fn: SWAdvance(s.cvtid) }))
			.filter(
				g =>
					g.wsrc > wsrc ? (g.wsrc - wsrc) / wsrc < 1 / 12 : (wsrc - g.wsrc) / wsrc < 1 / 6
			)
	].sort((a, b) => Math.abs(a.wsrc - wsrc) - Math.abs(b.wsrc - wsrc));

	for (let ppem = 0; ppem < sd.length; ppem++) {
		const pos0 = pos0s ? pos0s[ppem] : s.posKey.y;
		if (!sd[ppem] || !sd[ppem].y || !sd[ppem].y[sid]) {
			hintedPositions[ppem] = roundings.rtg(pos0, upm, ppem);
			continue;
		}
		const [ytouch, wtouch, isStrict, isStacked] = sd[ppem].y[sid];
		const uppx = upm / ppem;
		const psrc = roundings.rtg(pos0, upm, ppem);
		const wdst = wtouch * (upm / ppem);

		if (s.posKeyAtTop) {
			const pdst = ytouch * (upm / ppem);
			hintedPositions[ppem] = pdst;
			deltaPos.push({
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS
			});
			for (let adg of advDeltaGroups) {
				const rawDelta = decideDeltaShift(
					ROUNDING_SEGMENTS,
					-1,
					isStrict,
					isStacked,
					pdst,
					adg.wsrc,
					pdst,
					wdst,
					upm,
					ppem
				);
				const advDelta = clampAdvDelta(-1, isStrict, adg.wsrc <= wsrc, rawDelta);
				adg.deltas.push({ ppem, delta: advDelta });
			}
		} else {
			const pdst = (ytouch - wtouch) * (upm / ppem) - (s.advKey.x - s.posKey.x) * s.slope;
			const pd = decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS;
			deltaPos.push({ ppem, delta: pd });
			hintedPositions[ppem] = psrc + pd * (upm / ppem);
			for (let adg of advDeltaGroups) {
				const rawDelta = decideDeltaShift(
					ROUNDING_SEGMENTS,
					1,
					isStrict,
					isStacked,
					pdst,
					adg.wsrc,
					pdst,
					wdst,
					upm,
					ppem
				);
				const advDelta = clampAdvDelta(1, isStrict, adg.wsrc <= wsrc, rawDelta);
				adg.deltas.push({ ppem, delta: advDelta });
			}
		}
	}
	// decide optimal advance delta group
	for (let g of advDeltaGroups) {
		g.totalDelta += estimateDeltaImpact(g.deltas);
	}
	const adg = advDeltaGroups.reduce((a, b) => (a.totalDelta <= b.totalDelta ? a : b));

	// decide optimal YMove
	let bestYMove = 0;
	let bestPosImpact = estimateDeltaImpact(deltaPos);
	let bestPosDeltas = deltaPos;
	for (let yMove of yMoves) {
		if (!yMove) continue;
		const yMoveImpact = yMove > 0 ? 3 : yMove < 0 ? 6 : 0;
		const dps = deltaPos.map(d => ({ ppem: d.ppem, delta: d.delta - yMove }));
		const impact = yMoveImpact + estimateDeltaImpact(dps);
		if (impact < bestPosImpact) {
			bestYMove = yMove;
			bestPosDeltas = dps;
			bestPosImpact = impact;
		}
	}

	// instructions
	// position edge
	if (bestYMove) talk(`YMove(${bestYMove},${s.posKey.id})`);
	talk(sanityDelta(s.posKey.id, bestPosDeltas));
	// advance edge
	talk(adg.fn(s.posKey.id, s.advKey.id, strategy));
	talk(sanityDelta(s.advKey.id, adg.deltas));

	for (let zp of s.posAlign) talk(`YShift(${s.posKey.id},${zp.id})`);
	for (let zp of s.advAlign) talk(`YShift(${s.advKey.id},${zp.id})`);
	return {
		buf: buf,
		ipz: s.posKey.id,
		hintedPositions,
		pOrg: s.posKey.y,
		totalDeltaImpact: bestPosImpact + adg.totalDelta
	};
}

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

// si : size-inpendent actions
// sd : size-dependent actions
// strategy : strategy object
// padding : CVT padding value, padding + 2 -> bottom anchor; padding + 1 -> top anchor
function produceVTTTalk(record, strategy, padding, isXML) {
	const sd = record.sd;
	const si = record.si;
	const pmin = record.pmin;
	const pmax = record.pmax;
	const upm = strategy.UPM;

	const cvtZeroId = padding;
	const cvtTopId = padding + 1;
	const cvtBottomId = padding + 2;
	const cvtTopDId = padding + 5;
	const cvtBottomDId = padding + 6;
	const cvtTopBarId = padding + 3;
	const cvtBottomBarId = padding + 4;
	const cvtTopBotDistId = padding + 7;
	const cvtTopBotDDistId = padding + 8;

	const cvtCSW = padding + 9;
	const cvtCSWD = padding + 10;

	const { yBotBar, yTopBar, yBotD, yTopD, canonicalSW, SWDs } = getVTTAux(strategy);

	const SWS = [
		{ width: canonicalSW, cvtid: cvtCSW },
		...SWDs.map((x, j) => ({ width: x, cvtid: cvtCSWD + j }))
	];

	let buf = "";
	function talk(s) {
		buf += s + "\n";
	}

	//// X

	if (si.xIP && si.xIP.length > 1) {
		const zmin = si.xIP[0];
		const zmax = si.xIP[si.xIP.length - 1];
		let deltaL = [];
		let deltaR = [];
		for (let ppem = 0; ppem < sd.length; ppem++) {
			if (!sd[ppem] || !sd[ppem].x) continue;
			const xExp = sd[ppem].x.expansion;
			const xL0 = zmin.x;
			const xL1 = strategy.UPM / 2 + (xL0 - strategy.UPM / 2) * xExp;
			deltaL.push({
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, xL0, xL1, upm, ppem) / ROUNDING_SEGMENTS
			});

			const xR0 = zmax.x;
			const xR1 = strategy.UPM / 2 + (xR0 - strategy.UPM / 2) * xExp;
			deltaR.push({
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, xR0, xR1, upm, ppem) / ROUNDING_SEGMENTS
			});
		}
		const tkL = sanityDelta(zmin.id, deltaL, "XDelta");
		const tkR = sanityDelta(zmax.id, deltaR, "XDelta");
		if (tkL || tkR) {
			// talk("/** !!IDH!! X-Expansion");
			// talk(`XAnchor(${zmin.id})`);
			// talk(tkL);
			// talk(`XAnchor(${zmax.id})`);
			// talk(tkR);
			// if (si.xIP.length > 2) {
			// 	talk(`XInterpolate(${si.xIP.map(z => z.id).join(",")})`);
			// }
			// talk("**/");
		}
	}

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
					encodeAnchor(
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
					encodeAnchor(
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
					encodeAnchor(
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
			const { totalDeltaImpact: tdi, buf, hintedPositions } = encodeStem(
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
			const { totalDeltaImpact: tdi, buf, hintedPositions } = encodeStem(
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

		for (let r of candidates) {
			if (r.told) continue;
			// ASSERT: r.kind === KEY_ITEM_STEM
			if (r.pOrg > bottomStem.pOrg && r.pOrg < topStem.pOrg) {
				talk(`/* !!IDH!! StemDef ${r.sid} INTERPOLATE */`);
				const g = encodeStem(
					r.stem,
					r.sid,
					sd,
					strategy,
					iphintedPositions(bottomStem, r, topStem, pmin, pmax),
					SWS
				);
				talk(g.buf);
				tdis += g.totalDeltaImpact;
			} else {
				// Should not happen
				talk(`/* !!IDH!! StemDef ${r.sid} DIRECT */`);
				talk(`YAnchor(${r.ipz})`);
				const g = encodeStem(r.stem, r.sid, sd, strategy, null, SWS);
				talk(g.buf);
				tdis += g.totalDeltaImpact;
			}
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

function generateCVT(cvt, cvtPadding, strategy) {
	const { yBotBar, yTopBar, yBotD, yTopD, canonicalSW, SWDs } = getVTTAux(strategy);
	cvt = cvt
		.replace(new RegExp(`${cvtPadding}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 1}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 2}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 3}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 4}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 5}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 6}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 7}` + "\\s*:\\s*-?\\d+"), "")
		.replace(new RegExp(`${cvtPadding + 8}` + "\\s*:\\s*-?\\d+"), "");
	return (
		cvt +
		`
/*## !! MEGAMINX !! BEGIN SECTION ideohint_CVT_entries ##*/
${cvtPadding} : ${0}
${cvtPadding + 1} : ${strategy.BLUEZONE_TOP_CENTER}
${cvtPadding + 2} : ${strategy.BLUEZONE_BOTTOM_CENTER}
${cvtPadding + 3} : ${yTopBar}
${cvtPadding + 4} : ${yBotBar}
${cvtPadding + 5} : ${yTopD}
${cvtPadding + 6} : ${yBotD}
${cvtPadding + 7} : ${strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER}
${cvtPadding + 8} : ${yTopD - yBotD}
${cvtPadding + 9} : ${canonicalSW}
${SWDs.map((x, j) => cvtPadding + 10 + j + " : " + x).join("\n")}
/*## !! MEGAMINX !! END SECTION ideohint_CVT_entries ##*/
`
	);
}

exports.talk = produceVTTTalk;
exports.generateCVT = generateCVT;
