"use strict";

const roundings = require("../support/roundings");
const toF26D6P = roundings.toF26D6P;
const { decideDelta, decideDeltaShift } = require("./delta.js");
const { getVTTAux } = require("./cvt");

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
function sanityDelta(z, d, tag) {
	var deltas = d.filter(x => x.delta);
	if (!deltas.length) return "";

	let deltaData = {};
	for (let { delta, ppem } of deltas) {
		let quantity = formatdelta(delta);
		if (!deltaData[quantity]) deltaData[quantity] = [];
		deltaData[quantity].push(ppem);
	}
	const keys = Object.keys(deltaData);
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
function encodeStem(s, sid, sd, strategy, pos0s) {
	let buf = "";
	const upm = strategy.UPM;
	function talk(s) {
		buf += s + "\n";
	}

	let deltaPos = [];
	let deltaADv = [];
	let pDsts = [];
	let totalPosDelta = 0;

	for (let ppem = 0; ppem < sd.length; ppem++) {
		const pos0 = pos0s ? pos0s[ppem] : s.posKey.y;
		if (!sd[ppem] || !sd[ppem][sid]) {
			pDsts[ppem] = roundings.rtg(pos0, upm, ppem);
			continue;
		}
		const [ytouch, wtouch, isStrict, isStacked] = sd[ppem][sid];
		const uppx = upm / ppem;
		const wsrc = s.posKeyAtTop
			? s.posKey.y - s.advKey.y + (s.advKey.x - s.posKey.x) * s.slope
			: s.advKey.y - s.posKey.y + (s.posKey.x - s.advKey.x) * s.slope;
		const psrc = roundings.rtg(pos0, upm, ppem);
		const wdst = wtouch * (upm / ppem);
		if (s.posKeyAtTop) {
			const pdst = ytouch * (upm / ppem);
			const posdelta = {
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS
			};
			totalPosDelta += posdelta.delta * posdelta.delta;
			deltaPos.push(posdelta);
			deltaADv.push({
				ppem,
				delta:
					decideDeltaShift(
						ROUNDING_SEGMENTS,
						-1,
						isStrict,
						isStacked,
						pdst,
						wsrc,
						pdst,
						wdst,
						upm,
						ppem
					) / ROUNDING_SEGMENTS
			});
			pDsts[ppem] = pdst;
		} else {
			const pdst = (ytouch - wtouch) * (upm / ppem) - (s.advKey.x - s.posKey.x) * s.slope;
			const posdelta = {
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS
			};
			totalPosDelta += posdelta.delta * posdelta.delta;
			deltaPos.push(posdelta);
			deltaADv.push({
				ppem,
				delta:
					decideDeltaShift(
						ROUNDING_SEGMENTS,
						1,
						isStrict,
						isStacked,
						pdst,
						wsrc,
						pdst,
						wdst,
						upm,
						ppem
					) / ROUNDING_SEGMENTS
			});
			pDsts[ppem] = psrc + posdelta.delta * (upm / ppem);
		}
	}

	talk(sanityDelta(s.posKey.id, deltaPos));
	if (strategy.SIGNIFICANT_LINK_ARROW) {
		talk(`YNoRound(${s.advKey.id})`);
		talk(`YDist(${s.posKey.id},${s.advKey.id})`);
	} else {
		talk(`YShift(${s.posKey.id},${s.advKey.id}) /* !IMPORTANT */`);
	}
	talk(sanityDelta(s.advKey.id, deltaADv));
	for (let zp of s.posAlign) {
		talk(`YShift(${s.posKey.id},${zp.id})`);
	}
	for (let zp of s.advAlign) {
		talk(`YShift(${s.advKey.id},${zp.id})`);
	}
	return {
		buf: buf,
		ipz: s.posKey.id,
		pDsts,
		pOrg: s.posKey.y,
		totalPosDelta
	};
}

function table(min, max, f) {
	let a = [];
	for (let j = min; j <= max; j++) {
		a[j] = f(j);
	}
	return a;
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

	const { yBotBar, yTopBar, yBotD, yTopD } = getVTTAux(
		strategy.BLUEZONE_BOTTOM_CENTER,
		strategy.BLUEZONE_TOP_CENTER
	);

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
			if (!si.xExpansion[ppem]) continue;
			const xL0 = zmin.x;
			const xL1 = strategy.UPM / 2 + (xL0 - strategy.UPM / 2) * si.xExpansion[ppem];
			deltaL.push({
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, xL0, xL1, upm, ppem) / ROUNDING_SEGMENTS
			});

			const xR0 = zmax.x;
			const xR1 = strategy.UPM / 2 + (xR0 - strategy.UPM / 2) * si.xExpansion[ppem];
			deltaR.push({
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, xR0, xR1, upm, ppem) / ROUNDING_SEGMENTS
			});
		}
		const tkL = sanityDelta(zmin.id, deltaL, "XDelta");
		const tkR = sanityDelta(zmax.id, deltaR, "XDelta");
		if (tkL || tkR) {
			talk("/**");
			talk(`XAnchor(${zmin.id})`);
			talk(tkL);
			talk(`XAnchor(${zmax.id})`);
			talk(tkR);
			if (si.xIP.length > 2) {
				talk(`XInterpolate(${si.xIP.map(z => z.id).join(",")})`);
			}
			talk("**/");
		}
	}

	//// Y

	// ip decider
	const pDstsBot = table(pmin, pmax, ppem =>
		roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
	);
	const pDstsTop0 = table(pmin, pmax, ppem =>
		roundings.rtg(strategy.BLUEZONE_TOP_CENTER, upm, ppem)
	);
	const pDstsTop = table(
		pmin,
		pmax,
		ppem =>
			roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem) +
			roundings.rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
	);
	const pDstsBotB = table(pmin, pmax, ppem => roundings.rtg(yBotBar, upm, ppem));
	const pDstsTopB = table(pmin, pmax, ppem => roundings.rtg(yTopBar, upm, ppem));
	const pDstsBotD = table(pmin, pmax, ppem => roundings.rtg(yBotD, upm, ppem));
	const pDstsTopD = table(pmin, pmax, ppem => roundings.rtg(yTopD, upm, ppem));
	const pDstsTopDLinked = table(
		pmin,
		pmax,
		ppem =>
			roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem) +
			roundings.rtg(yTopD - yBotD, upm, ppem)
	);
	let candidates = [];

	let hasBottommost = false;
	let bottomMostZ = null;

	// Initialize candidates
	for (let z of si.blue.bottomZs) {
		if (Math.abs(z.y - yBotD) < Math.abs(z.y - strategy.BLUEZONE_BOTTOM_CENTER)) {
			candidates.push({
				ipz: z.id,
				pOrg: z.y,
				kind: 3,
				talk: `
/* !!IDH!! Bottom Anchor Kind 2 */
YAnchor(${z.id},${cvtBottomDId})
${encodeAnchor(z.id, pDstsBotD, pDstsBot, pmin, pmax, strategy)}`,
				pDsts: pDstsBot
			});
			if (
				!hasBottommost ||
				z.y < bottomMostZ.y ||
				(z.y === bottomMostZ.y && z.x < bottomMostZ.x)
			) {
				hasBottommost = true;
				bottomMostZ = z;
			}
		} else {
			candidates.push({
				ipz: z.id,
				pOrg: z.y,
				kind: 3,
				talk: `
/* !!IDH!! Bottom Anchor Kind 1 */
YAnchor(${z.id},${cvtBottomId})`,
				pDsts: pDstsBot
			});
			if (
				!hasBottommost ||
				z.y < bottomMostZ.y ||
				(z.y === bottomMostZ.y && z.x < bottomMostZ.x)
			) {
				hasBottommost = true;
				bottomMostZ = z;
			}
		}
	}
	for (let z of si.blue.topZs) {
		// 		if (hasBottommost) {
		// 			candidates.push({
		// 				ipz: z.id,
		// 				pOrg: z.y,
		// 				kind: 2,
		// 				talk: `
		// /* !!IDH!! Top Anchor Kind 3 */
		// YLink(${bottomMostZ.id},${z.id},${cvtTopBotDistId})`,
		// 				pDsts: pDstsTop
		// 			});
		// 		} else
		if (Math.abs(z.y - yTopD) < Math.abs(z.y - strategy.BLUEZONE_TOP_CENTER)) {
			candidates.push({
				ipz: z.id,
				pOrg: z.y,
				kind: 2,
				talk: `
/* !!IDH!! Top Anchor Kind 2 */
YAnchor(${z.id},${cvtTopDId})
${encodeAnchor(z.id, pDstsTopD, pDstsTop, pmin, pmax, strategy)}`,
				pDsts: pDstsTop
			});
		} else {
			candidates.push({
				ipz: z.id,
				pOrg: z.y,
				kind: 2,
				talk: `
/* !!IDH!! Top Anchor Kind 1 */
YAnchor(${z.id},${cvtTopId})
${encodeAnchor(z.id, pDstsTop0, pDstsTop, pmin, pmax, strategy)}`,
				pDsts: pDstsTop
			});
		}
	}
	for (let sid = 0; sid < si.stems.length; sid++) {
		const s = si.stems[sid];
		candidates.push({
			stem: s,
			sid: sid,
			ipz: s.posKey.id,
			kind: 1,
			pOrg: s.posKey.y,
			pDsts: null
		});
	}
	candidates = candidates.sort((a, b) => a.pOrg - b.pOrg);

	// Stems
	const refTop = candidates[candidates.length - 1];
	const refBottom = candidates[0];
	if (refTop && refBottom) {
		if (!refTop.pDsts) {
			talk(`/* !!IDH!! StemDef ${refTop.sid} TOP */`);
			let { pDsts: pDsts1, buf: buf1 } = encodeStem(
				refTop.stem,
				refTop.sid,
				sd,
				strategy,
				null
			);
			talk(`YAnchor(${refTop.ipz})`);
			refTop.pDsts = pDsts1;
			talk(buf1);
		}
		if (!refBottom.pDsts) {
			talk(`/* !!IDH!! StemDef ${refBottom.sid} BOTTOM */`);
			let { pDsts: pDsts1, buf: buf1, totalPosDelta: tpd1 } = encodeStem(
				refBottom.stem,
				refBottom.sid,
				sd,
				strategy,
				null
			);
			let { pDsts: pDsts2, buf: buf2, totalPosDelta: tpd2 } = encodeStem(
				refBottom.stem,
				refBottom.sid,
				sd,
				strategy,
				pDstsBotB
			);
			if (tpd1 < tpd2) {
				talk(`YAnchor(${refBottom.ipz})`);
				refBottom.pDsts = pDsts1;
				talk(buf1);
			} else {
				talk(`YAnchor(${refBottom.ipz},${cvtBottomBarId})`);
				refBottom.pDsts = pDsts2;
				talk(buf2);
			}
		}
		const ipAnchorZs = [];
		const ipZs = [];
		for (let r of candidates) {
			if ((r === refTop || r === refBottom) && r.talk) {
				talk(r.talk);
				continue;
			}
			if (r.stem) {
				if (r.pDsts) continue;
				if (r.pOrg > refBottom.pOrg && r.pOrg < refTop.pOrg) {
					ipAnchorZs.push(r.ipz);
				}
			} else {
				ipZs.push(r.ipz);
			}
		}
		if (ipAnchorZs.length) {
			talk(`YIPAnchor(${refBottom.ipz},${ipAnchorZs.join(",")},${refTop.ipz})`);
		}
		if (ipZs.length) {
			talk(`YInterpolate(${refBottom.ipz},${ipZs.join(",")},${refTop.ipz})`);
		}

		for (let r of candidates) {
			if (!r.stem) continue;
			if (r.pDsts) continue;
			if (r.pOrg > refBottom.pOrg && r.pOrg < refTop.pOrg) {
				talk(`/* !!IDH!! StemDef ${r.sid} INTERPOLATE */`);
				let pos0s = table(pmin, pmax, ppem => {
					const org_dist = r.pOrg - refBottom.pOrg;
					const org_range = refTop.pOrg - refBottom.pOrg;
					const cur_range = refTop.pDsts[ppem] - refBottom.pDsts[ppem];
					return refBottom.pDsts[ppem] + cur_range * org_dist / org_range;
				});
				let { pDsts, buf } = encodeStem(r.stem, r.sid, sd, strategy, pos0s);
				talk(buf);
				r.pDsts = pDsts;
			} else {
				talk(`/* !!IDH!! StemDef ${r.sid} DIRECT */`);
				talk(`YAnchor(${r.ipz})`);
				let { pDsts, buf } = encodeStem(r.stem, r.sid, sd, strategy, null);
				talk(buf);
				r.pDsts = pDsts;
			}
		}
	}
	/* Diag-aligns */
	for (let da of si.diagAligns) {
		if (!da.zs.length) continue;
		talk(`XAnchor(${da.l})`);
		talk(`XAnchor(${da.r})`);
		talk(`DAlign(${da.l},${da.zs.join(",")},${da.r})`);
	}
	/** IPSA calls */
	var l = 0;
	for (let j = 1; j < si.ipsacalls.length; j++) {
		if (
			si.ipsacalls[l] &&
			si.ipsacalls[j] &&
			si.ipsacalls[l].length > 2 &&
			si.ipsacalls[l].length < 16 &&
			si.ipsacalls[j].length > 2 &&
			si.ipsacalls[l][0] === si.ipsacalls[j][0] &&
			si.ipsacalls[l][1] === si.ipsacalls[j][1]
		) {
			si.ipsacalls[l].push(si.ipsacalls[j][2]);
			si.ipsacalls[j] = null;
		} else {
			l = j;
		}
	}
	for (let c of si.ipsacalls) {
		if (!c) continue;
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
	const { yBotBar, yTopBar, yBotD, yTopD } = getVTTAux(
		strategy.BLUEZONE_BOTTOM_CENTER,
		strategy.BLUEZONE_TOP_CENTER
	);
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
/* IDEOHINT */
${cvtPadding} : ${0}
${cvtPadding + 1} : ${strategy.BLUEZONE_TOP_CENTER}
${cvtPadding + 2} : ${strategy.BLUEZONE_BOTTOM_CENTER}
${cvtPadding + 3} : ${yTopBar}
${cvtPadding + 4} : ${yBotBar}
${cvtPadding + 5} : ${yTopD}
${cvtPadding + 6} : ${yBotD}
${cvtPadding + 7} : ${strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER}
${cvtPadding + 8} : ${yTopD - yBotD}
`
	);
}

exports.talk = produceVTTTalk;
exports.generateCVT = generateCVT;
