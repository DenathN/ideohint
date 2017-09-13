"use strict";
const { decideDelta, decideDeltaShift } = require("../delta.js");
const { xclamp } = require("../../support/common");
const roundings = require("../../support/roundings");
const { fpgmShiftOf } = require("./vttenv");

const ROUNDING_SEGMENTS = 8;
const SDB = 9;
const SDS = ROUNDING_SEGMENTS;

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
	encode(z, d, tag) {
		if (!this.fpgmPad) return super.encode(z, d, tag);
		let deltaComment =
			"/*" +
			d
				.filter(x => x.delta)
				.map(x => x.ppem + ":" + x.delta)
				.join(" ") +
			"*/\n";
		return deltaComment + this.encodeDelta(z, d, tag).buf;
	}

	encodeDeltaByte(dPPEM, shift) {
		return dPPEM * 16 + (shift > 0 ? 7 + shift : shift + 8);
	}
	encodeDelta(z, d, tag) {
		const dltpg = {
			DLTP1: [],
			DLTP2: [],
			DLTP3: []
		};
		let bytes = 0;
		let buf = "";
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
					dltp.push(this.encodeDeltaByte(dPPEM, shift));

					bytes += 1;
					delta -= shift;
				} while (delta);
			else
				do {
					const shift = Math.max(delta, -SDS);
					if (!shift) break;
					dltp.push(this.encodeDeltaByte(dPPEM, shift));

					bytes += 1;
					delta -= shift;
				} while (delta);
		}
		if (!bytes) return { bytes: 0, buf: "" };

		if (
			dltpg.DLTP1.length &&
			dltpg.DLTP2.length &&
			!dltpg.DLTP3.length &&
			dltpg.DLTP1.length + dltpg.DLTP2.length < 60
		) {
			const n1 = dltpg.DLTP1.length,
				n2 = dltpg.DLTP2.length;
			const trailArgs =
				n1 <= 16 && n2 <= 16
					? [((n1 - 1) << 4) | (n2 - 1), this.fpgmPad + fpgmShiftOf._combined_ss]
					: [n1, n2, this.fpgmPad + fpgmShiftOf._combined];
			const args = [...dltpg.DLTP1, ...dltpg.DLTP2, z, ...trailArgs];
			buf += `Call(${args.join(",")})\n`;
			bytes += n1 <= 16 && n2 <= 16 ? 4 : 5;
		} else {
			for (let instr in dltpg) {
				if (!dltpg[instr].length || !fpgmShiftOf[instr]) continue;
				while (dltpg[instr].length) {
					let slcLen = Math.min(60, dltpg[instr].length);
					let slc = dltpg[instr].slice(0, slcLen);
					dltpg[instr] = dltpg[instr].slice(slcLen);
					buf += `Call(${slc.join(",")},${z},${slcLen},${this.fpgmPad +
						fpgmShiftOf[instr]})\n`;
					bytes += 4;
				}
			}
		}
		return { bytes, buf: buf };
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

class AssemblyDeltaEncoder2 extends AssemblyDeltaEncoder {
	constructor(fpgmPad) {
		super(fpgmPad);
	}

	encodeIntDelta(z, d, fnid, tag) {
		let dataBytes = [];
		let curByte = 0;
		let deltas = [];
		for (let { ppem, delta } of d) {
			deltas[ppem] = Math.round(delta);
		}

		let pmin = 0xffff,
			pmax = 0;
		for (let ppem = 0; ppem < deltas.length; ppem++) {
			if (!deltas[ppem]) continue;
			if (ppem < pmin) pmin = ppem;
			if (ppem > pmax) pmax = ppem;
		}
		for (let ppem = pmin; ppem <= pmax; ppem++) {
			let delta = deltas[ppem] || 0;
			let dibit = delta === 1 ? 1 : delta === -1 ? 3 : delta === -2 ? 2 : 0;
			curByte = curByte | (dibit << (((ppem - pmin) % 4) << 1));
			if ((ppem - pmin) % 4 === 3) {
				dataBytes.push(curByte);
				curByte = 0;
			}
		}
		if (curByte) {
			dataBytes.push(curByte);
			curByte = 0;
		}
		if (dataBytes.length) {
			if (dataBytes.length >= 8 || pmin < SDB || pmin >= SDB + 32) return null;
			let args = [[...dataBytes].reverse(), z, ((pmin - SDB) << 3) | dataBytes.length];
			return {
				buf: `Call(${args},${fnid})`,
				bytes: 4 + dataBytes.length
			};
		} else {
			return { buf: "", bytes: 0 };
		}
	}
	encodeIntDeltaInternal(z, d, fnid, gear, lv, tag) {
		let iDelta = [],
			restDelta = [];
		for (let { ppem, delta } of d) {
			let iAmount = delta >= gear ? 1 : delta <= -2 * gear ? -2 : delta <= -gear ? -1 : 0;
			if (iAmount) iDelta.push({ ppem, delta: iAmount });
			if (delta - iAmount * gear) restDelta.push({ ppem, delta: delta - iAmount * gear });
		}
		let r1 = this.encodeIntDelta(z, iDelta, fnid, tag);
		if (!r1) return null;
		let r2 = this.encodeDeltaIntLevel(z, restDelta, lv + 1, tag);
		if (!r2) return null;
		return {
			bytes: r1.bytes + r2.bytes,
			buf: r1.buf + "\n" + r2.buf
		};
	}
	encodeDeltaIntLevel(z, d, level, tag) {
		let r = super.encodeDelta(z, d, tag);
		if (level >= 2) return r;
		{
			let r1 = this.encodeIntDeltaInternal(
				z,
				d,
				this.fpgmPad + fpgmShiftOf.comp_integral,
				1,
				level,
				tag
			);
			if (r1 && r1.bytes < r.bytes) r = r1;
		}
		{
			let r1 = this.encodeIntDeltaInternal(
				z,
				d,
				this.fpgmPad + fpgmShiftOf.comp_octet,
				1 / 8,
				level,
				tag
			);
			if (r1 && r1.bytes < r.bytes) r = r1;
		}
		{
			let r1 = this.encodeIntDeltaInternal(
				z,
				d,
				this.fpgmPad + fpgmShiftOf.comp_quad,
				1 / 4,
				level,
				tag
			);
			if (r1 && r1.bytes < r.bytes) r = r1;
		}
		return r;
	}
	encodeDelta(z, d, tag) {
		return this.encodeDeltaIntLevel(z, d, 0, tag);
	}
}

// Add a general shift
// Currently unused
class AssemblyDeltaEncoder3 extends AssemblyDeltaEncoder2 {
	constructor(fpgmPad) {
		super(fpgmPad);
	}
	encodeDelta(z, d, tag) {
		let ppemMin = 0xff,
			ppemMax = 0,
			qtyMap = new Map();
		for (let { ppem, delta } of d) {
			if (!delta) continue;
			if (ppem < ppemMin) ppemMin = ppem;
			if (ppem > ppemMax) ppemMax = ppem;
			if (!qtyMap.has(delta)) qtyMap.set(delta, 0);
			qtyMap.set(delta, 1 + qtyMap.get(delta));
		}

		let { bytes: mbytes, buf: mBuf } = super.encodeDelta(z, d, tag);

		for (let [shift, v] of qtyMap) {
			if (!shift) continue;
			let ppemMin = 0xff,
				ppemMax = 0,
				trailDelta = [];
			for (let { ppem, delta } of d) {
				if ((shift > 0 && delta <= 0) || (shift < 0 && delta >= 0)) continue;
				if (ppem < ppemMin) ppemMin = ppem;
				if (ppem > ppemMax) ppemMax = ppem;
			}
			for (let { ppem, delta } of d) {
				if (ppem >= ppemMin && ppem <= ppemMax) delta -= shift;
				if (delta) trailDelta.push({ ppem, delta });
			}
			if (ppemMin >= ppemMax) continue;
			let { bytes, buf } = super.encodeDelta(z, d, tag);
			bytes += shift > 0 ? 6 : 10;
			let shiftCall = shift ? `Call(${z},${shift * 64},${ppemMin},${ppemMax},72)` : "";
			if (bytes < mbytes) {
				mbytes = bytes;
				mBuf = shiftCall + "\n" + buf;
			}
		}
		return { bytes: mbytes, buf: mBuf };
	}
}

function standardAdvance(zpos, zadv, strategy) {
	return `YNoRound(${zadv})
YDist(${zpos},${zadv})`;
}

function SWAdvance(cvt) {
	return function(zpos, zadv) {
		return `YNoRound(${zadv})
YLink(${zpos},${zadv},${cvt})`;
	};
}

function clampAdvDelta(sign, isStrict, isLess, delta) {
	// if (!delta) return 0;
	// const willExpand = sign > 0 === delta < 0;
	// if (Math.abs(delta) < 1.5 && (!isStrict || willExpand === isLess)) {
	// 	return 0;
	// } else {
	return delta / ROUNDING_SEGMENTS;
	// }
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
							: (wsrc - g.wsrc) / wsrc < 1 / 8
				)
		].sort((a, b) => Math.abs(a.wsrc - wsrc) - Math.abs(b.wsrc - wsrc));

		for (let ppem = 0; ppem < sd.length; ppem++) {
			const pos0 = pos0s ? pos0s[ppem] : s.posKey.y;
			if (!sd[ppem] || !sd[ppem].y || !sd[ppem].y[sid]) {
				hintedPositions[ppem] = roundings.rtg(pos0, upm, ppem);
				continue;
			}
			const [ytouch, wtouch, isStrict, isStacked, addpxs] = sd[ppem].y[sid];
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
						ppem,
						addpxs
					);
					const advDelta = clampAdvDelta(
						-1,
						isStrict || isStacked,
						adg.wsrc <= wsrc,
						rawDelta
					);
					adg.deltas.push({ ppem, delta: advDelta, rawDelta });
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
						ppem,
						addpxs
					);
					const advDelta = clampAdvDelta(
						1,
						isStrict || isStacked,
						adg.wsrc <= wsrc,
						rawDelta
					);
					adg.deltas.push({ ppem, delta: advDelta, rawDelta });
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
		// Position delta
		talk(`/* !!IDH!! StemDef ${sid} INTERPOLATE */`);
		if (bestYMove) talk(`YMove(${bestYMove},${s.posKey.id})`);
		talk(this.deltaEncoder.encode(s.posKey.id, bestPosDeltas));
		const bufPosDelta = buf;
		buf = "";

		// Advance link
		talk(adg.fn(s.posKey.id, s.advKey.id, strategy));
		const bufAdvLink = buf;
		buf = "";

		// Advance delta
		talk(this.deltaEncoder.encode(s.advKey.id, adg.deltas));
		const bufAdvDelta = buf;
		buf = "";

		// In-stem alignments
		for (let zp of s.posAlign) talk(`YShift(${s.posKey.id},${zp.id})`);
		for (let zp of s.advAlign) talk(`YShift(${s.advKey.id},${zp.id})`);
		const bufIsal = buf;

		const parts = [bufPosDelta, bufAdvLink, bufAdvDelta, bufIsal];
		return {
			buf: parts.join(""),
			parts,
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
	AssemblyDeltaEncoder: AssemblyDeltaEncoder2,
	VTTECompiler
};
