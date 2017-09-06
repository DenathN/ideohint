"use strict";
const { decideDelta, decideDeltaShift } = require("../delta.js");
const { xclamp } = require("../../support/common");
const roundings = require("../../support/roundings");
const { fpgmShiftOf } = require("./vttenv");

const ROUNDING_SEGMENTS = 8;

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

function encodeDeltaVtt(quantity, _ppems) {
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

class VTTTalkDeltaEncoder {
	constructor() {}
	encode(z, d, tag) {
		const deltas = d.filter(x => x.delta);
		if (!deltas.length) return "";

		const { deltaData, keys } = deltaDataOf(deltas);
		if (!keys.length) return "";
		const deltaInstBody = keys.map(k => encodeDeltaVtt(k, deltaData[k])).join(",");
		return `${tag || "YDelta"}(${z},${deltaInstBody})`;
	}
	estimateImpact(d) {
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
}

class AssemblyDeltaEncoder extends VTTTalkDeltaEncoder {
	constructor(fpgmPad) {
		super();
		this.fpgmPad = fpgmPad;
	}
	encodeDeltaByte(dPPEM, shift) {
		return dPPEM * 16 + (shift > 0 ? 7 + shift : shift + 8);
	}
	encode(z, d, tag) {
		const SDB = 9;
		const SDS = ROUNDING_SEGMENTS;
		const dltpg = {
			DLTP1: [],
			DLTP2: [],
			DLTP3: []
		};

		for (let { ppem, delta: deltaPpem } of d) {
			if (!deltaPpem) continue;
			const dltp =
				ppem >= SDB && ppem < SDB + 16
					? dltpg.DLTP1
					: ppem >= SDB + 16 && ppem < SDB + 32
						? dltpg.DLTP2
						: ppem >= SDB + 32 && ppem < SDB + 48 ? dltpg.DLTP3 : null;
			if (!dltp) continue;
			const dPPEM = (ppem - SDB) % 16;

			let delta = Math.round(xclamp(-8, deltaPpem, 8) * SDS);
			if (delta > 0)
				do {
					const shift = Math.min(delta, SDS);
					if (!shift) break;
					if (this.fpgmPad) {
						dltp.push(this.encodeDeltaByte(dPPEM, shift));
					} else {
						dltp.push(`(${z} @${dPPEM} ${shift})`);
					}
					delta -= shift;
				} while (delta);
			else
				do {
					const shift = Math.max(delta, -SDS);
					if (!shift) break;
					if (this.fpgmPad) {
						dltp.push(this.encodeDeltaByte(dPPEM, shift));
					} else {
						dltp.push(`(${z} @${dPPEM} ${shift})`);
					}

					delta -= shift;
				} while (delta);
		}
		let buf = "/** > " + super.encode(z, d, tag) + " < **/\n";
		if (this.fpgmPad) {
			if (
				dltpg.DLTP1.length &&
				dltpg.DLTP2.length &&
				!dltpg.DLTP3.length &&
				dltpg.DLTP1.length + dltpg.DLTP2.length < 60
			) {
				const n1 = dltpg.DLTP1.length,
					n2 = dltpg.DLTP2.length;
				const trailArgs =
					n1 === n2
						? [n1, this.fpgmPad + fpgmShiftOf._combined_eq]
						: n1 + 1 === n2
							? [n1, this.fpgmPad + fpgmShiftOf._combined_g1]
							: n1 - 1 === n2
								? [n1, this.fpgmPad + fpgmShiftOf._combined_l1]
								: [n1, n2, this.fpgmPad + fpgmShiftOf._combined];
				const args = [...dltpg.DLTP1, ...dltpg.DLTP2, z, ...trailArgs];
				buf += `Call(${args.join(",")})\n`;
			} else {
				for (let instr in dltpg) {
					if (!dltpg[instr].length || !fpgmShiftOf[instr]) continue;
					while (dltpg[instr].length) {
						let slcLen = Math.min(60, dltpg[instr].length);
						let slc = dltpg[instr].slice(0, slcLen);
						dltpg[instr] = dltpg[instr].slice(slcLen);
						buf += `Call(${slc.join(",")},${z},${slcLen},${this.fpgmPad +
							fpgmShiftOf[instr]})\n`;
					}
				}
			}
			return buf;
		} else {
			for (let instr in dltpg) {
				if (!dltpg[instr].length) continue;
				buf += `    ${instr}[${dltpg[instr].join("")}]\n`;
			}
			return `ASM("\n${buf}")`;
		}
	}
	estimateImpact(d) {
		// impact caused by DLTP[]
		let impact = 0;
		// impact caused by SDS[]
		let sdsImpact = 0;
		// encoding bytes
		for (let dr of d) {
			let dq = Math.ceil(Math.abs(dr.delta));
			impact += dq; // two bytes for each entry
		}
		return impact;
	}
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

class VTTECompiler {
	constructor(deltaEncoder) {
		this.deltaEncoder = deltaEncoder;
	}
	encodeAnchor(z, ref, chosen, pmin, pmax, strategy) {
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
		return this.deltaEncoder.encode(z, deltas);
	}
	encodeStem(s, sid, sd, strategy, pos0s, sws, yMoves) {
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
						g.wsrc > wsrc
							? (g.wsrc - wsrc) / wsrc < 1 / 12
							: (wsrc - g.wsrc) / wsrc < 1 / 6
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
				const pd =
					decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS;
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
			g.totalDelta += this.deltaEncoder.estimateImpact(g.deltas);
		}
		const adg = advDeltaGroups.reduce((a, b) => (a.totalDelta <= b.totalDelta ? a : b));

		// decide optimal YMove
		let bestYMove = 0;
		let bestPosImpact = this.deltaEncoder.estimateImpact(deltaPos);
		let bestPosDeltas = deltaPos;
		for (let yMove of yMoves) {
			if (!yMove) continue;
			const yMoveImpact = yMove > 0 ? 3 : yMove < 0 ? 6 : 0;
			const dps = deltaPos.map(d => ({ ppem: d.ppem, delta: d.delta - yMove }));
			const impact = yMoveImpact + this.deltaEncoder.estimateImpact(dps);
			if (impact < bestPosImpact) {
				bestYMove = yMove;
				bestPosDeltas = dps;
				bestPosImpact = impact;
			}
		}

		// instructions
		// position edge
		if (bestYMove) talk(`YMove(${bestYMove},${s.posKey.id})`);
		talk(this.deltaEncoder.encode(s.posKey.id, bestPosDeltas));
		// advance edge
		talk(adg.fn(s.posKey.id, s.advKey.id, strategy));
		talk(this.deltaEncoder.encode(s.advKey.id, adg.deltas));

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
}

module.exports = {
	ROUNDING_SEGMENTS,
	VTTTalkDeltaEncoder,
	AssemblyDeltaEncoder,
	VTTECompiler
};
