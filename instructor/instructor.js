"use strict";

const roundings = require("../support/roundings");
const util = require("util");
const pushargs = require("./invoke").pushargs;
const invokesToInstrs = require("./invoke").invokesToInstrs;
const pushInvokes = require("./invoke").pushInvokes;

const decideDelta = require("./delta.js").decideDelta;
const decideDeltaShift = require("./delta.js").decideDeltaShift;

function ipsaInvokes(actions) {
	if (!actions) return [];
	var invokes = [];
	var cur_rp0 = -1;
	var cur_rp1 = -1;
	var cur_rp2 = -1;
	for (var k = 0; k < actions.length; k++) {
		if (!actions[k]) continue;
		if (actions[k].length > 2 && actions[k][0] === actions[k][1]) {
			actions[k] = [actions[k][0], actions[k][2]];
		}
		if (actions[k].length > 2) {
			// an IP
			var rp1 = actions[k][0];
			var rp2 = actions[k][1];
			if (cur_rp1 !== rp1) {
				cur_rp1 = rp1;
				invokes.push([[rp1], ["SRP1"]]);
			}
			if (cur_rp2 !== rp2) {
				cur_rp2 = rp2;
				invokes.push([[rp2], ["SRP2"]]);
			}
			invokes.push([[actions[k][2]], ["IP"]]);
		} else {
			// an short absorption
			var rp1 = actions[k][0];
			if (cur_rp1 !== rp1) {
				cur_rp1 = rp1;
				invokes.push([[rp1], ["SRP1"]]);
			}
			invokes.push([[actions[k][1]], ["SHP[rp1]"]]);
		}
	}
	return invokes;
}

function pushDeltaCalls(deltaCalls, invocations, STACK_DEPTH) {
	if (!deltaCalls.length) return;
	var currentDeltaCall = {
		arg: deltaCalls[0].arg.slice(0),
		instruction: deltaCalls[0].instruction
	};
	for (var j = 1; j < deltaCalls.length; j++) {
		if (
			deltaCalls[j].instruction === currentDeltaCall.instruction &&
			currentDeltaCall.arg.length + deltaCalls[j].arg.length < STACK_DEPTH - 10
		) {
			// Same Instruction
			currentDeltaCall.arg = currentDeltaCall.arg.concat(deltaCalls[j].arg);
		} else {
			currentDeltaCall.arg.push(currentDeltaCall.arg.length >> 1);
			invocations.push([currentDeltaCall.arg, [currentDeltaCall.instruction]]);
			currentDeltaCall = {
				arg: deltaCalls[j].arg.slice(0),
				instruction: deltaCalls[j].instruction
			};
		}
	}
	currentDeltaCall.arg.push(currentDeltaCall.arg.length >> 1);
	invocations.push([currentDeltaCall.arg, [currentDeltaCall.instruction]]);
}

const SDS = 4;
const GEAR = 16;
const SDS_COARSE = 2;
const GEAR_COARSE = 4;

function instruct(record, strategy, padding) {
	const si = record.si;
	const sd = record.sd;
	const pmin = record.pmin;
	const pmax = record.pmax;

	var padding = padding || 0;
	var upm = strategy.UPM || 1000;
	var cvtTopID = padding + 1;
	var cvtBottomID = padding + 2;

	function encodeDeltaVal(d, ppem) {
		if (!d) return [];
		if (d < -8) {
			return encodeDeltaVal(-8, ppem).concat(encodeDeltaVal(d + 8, ppem));
		}
		if (d > 8) {
			return encodeDeltaVal(8, ppem).concat(encodeDeltaVal(d - 8, ppem));
		}
		var selector = d > 0 ? d + 7 : d + 8;
		var deltappem = (ppem - pmin) % 16;
		return [deltappem * 16 + selector];
	}

	function encodeDelta(d, ppem) {
		if (d >= 0) {
			var dCoarse = (d / GEAR_COARSE) | 0;
			var dFine = d % GEAR_COARSE;
			return {
				coarse: encodeDeltaVal(dCoarse, ppem),
				fine: encodeDeltaVal(dFine, ppem)
			};
		} else {
			var dCoarse = (-d / GEAR_COARSE) | 0;
			var dFine = -d % GEAR_COARSE;
			return {
				coarse: encodeDeltaVal(-dCoarse, ppem),
				fine: encodeDeltaVal(-dFine, ppem)
			};
		}
	}

	function pushDelta(deltas, id, d) {
		deltas.push({ id, delta: d });
	}

	var STACK_DEPTH = strategy.STACK_DEPTH || 200;
	var invocations = [];

	// if(!si.stems.length) return;
	var tt = ["SVTCA[y-axis]", "RTG"];

	// Blue zone alignment instructions
	// Bottom
	for (var k = 0; k < si.blue.bottomZs.length; k++) {
		invocations.push([[si.blue.bottomZs[k].id, cvtBottomID], ["MIAP[rnd]"]]);
	}
	pushInvokes(tt, invocations, STACK_DEPTH);
	// Top
	// Normal cases:
	// Padding + 3 + ppem is the CVT index of top blue zone center.
	tt.push("PUSHB_1", pmin, "MPPEM", "LTEQ", "PUSHB_1", pmax, "MPPEM", "GTEQ", "AND", "IF");
	tt.push("MPPEM");
	pushargs(tt, padding + 3);
	tt.push("ADD");
	for (var k = 0; k < si.blue.topZs.length; k++) {
		tt.push("DUP");
		pushargs(tt, si.blue.topZs[k].id);
		tt.push("SWAP", "MIAP[0]"); // Don't round top absorptions
	}
	tt.push("CLEAR");
	tt.push("ELSE");
	for (var k = 0; k < si.blue.topZs.length; k++) {
		invocations.push([[si.blue.topZs[k].id, cvtTopID], ["MIAP[rnd]"]]);
	}
	pushInvokes(tt, invocations, STACK_DEPTH);
	tt.push("EIF");

	// Microsoft eats my deltas, I have to add additional MDAPs
	// cf. http://www.microsoft.com/typography/cleartype/truetypecleartype.aspx#Toc227035721
	if (si.stems.length) {
		for (var k = 0; k < si.stems.length; k++) {
			invocations.push([[si.stems[k].posKey.id], ["MDAP[rnd]"]]);
			invocations.push([[si.stems[k].advKey.id], ["MDRP[0]"]]);
		}
	}

	invocations.push([[pmin], ["SDB"]]);
	var deltaCalls = {
		coarse: [],
		fine: []
	};
	var mirps = [];
	if (si.stems.length)
		for (var ppem = 0; ppem < sd.length; ppem++) {
			const uppx = upm / ppem;
			if (!sd[ppem]) continue;
			// The instes' length sould be exactly si.stems.length.
			const instrs = sd[ppem].y;
			let deltas = [];
			for (var k = 0; k < instrs.length; k++) {
				if (!instrs[k]) continue;
				const [y, w, isStrict, isStacked] = instrs[k];
				const stem = si.stems[k];
				const y0 = stem.posKeyAtTop ? stem.posKey.y : stem.advKey.y;
				const w0 = stem.posKeyAtTop
					? stem.posKey.y - stem.advKey.y + (stem.advKey.x - stem.posKey.x) * stem.slope
					: stem.advKey.y - stem.posKey.y + (stem.posKey.x - stem.advKey.x) * stem.slope;
				const keyDX = stem.advKey.x - stem.posKey.x;
				if (stem.posKeyAtTop) {
					var ypos = y * uppx;
					var ypos0 = roundings.rtg(y0, upm, ppem);
				} else {
					var ypos = (y - w) * uppx - keyDX * stem.slope;
					var ypos0 = roundings.rtg(y0 - w0 - keyDX * stem.slope, upm, ppem);
				}

				deltas.push({
					id: stem.posKey.id,
					deltas: encodeDelta(decideDelta(GEAR, ypos0, ypos, upm, ppem), ppem)
				});

				var originalAdvance = w0;
				var targetAdvance = w * (upm / ppem);

				deltas.push({
					id: stem.advKey.id,
					deltas: encodeDelta(
						decideDeltaShift(
							GEAR,
							stem.posKeyAtTop ? -1 : 1,
							isStrict,
							isStacked,
							ypos0,
							originalAdvance,
							ypos,
							targetAdvance,
							upm,
							ppem
						),
						ppem
					)
				});
			}
			if (!deltas.length) continue;
			for (var j = 0; j < deltas.length; j++) {
				let { deltas: { coarse, fine }, id } = deltas[j];
				let instr = "DELTAP" + (1 + Math.floor((ppem - pmin) / 16));
				for (let d of coarse) {
					deltaCalls.coarse.push({
						arg: [d, id],
						instruction: instr
					});
				}
				for (let d of fine) {
					deltaCalls.fine.push({
						arg: [d, id],
						instruction: instr
					});
				}
			}
		}

	invocations.push([[SDS - SDS_COARSE], ["SDS"]]);
	pushDeltaCalls(deltaCalls.coarse, invocations, STACK_DEPTH);
	invocations.push([[SDS], ["SDS"]]);
	pushDeltaCalls(deltaCalls.fine, invocations, STACK_DEPTH);

	mirps.push("PUSHB_1", pmax, "MPPEM", "LT", "IF");
	var largeMdrpInvokes = [];
	if (si.stems.length) {
		for (var k = 0; k < si.stems.length; k++) {
			largeMdrpInvokes.push(
				[[si.stems[k].posKey.id], ["SRP0"]],
				[[si.stems[k].advKey.id], ["MDRP[0]"]]
			);
		}
	}
	pushInvokes(mirps, largeMdrpInvokes, STACK_DEPTH);
	mirps.push("EIF");

	// In-stem alignments
	var isalInvocations = [];
	for (var j = 0; j < si.stems.length; j++) {
		[
			[si.stems[j].posKey.id, si.stems[j].posAlign],
			[si.stems[j].advKey.id, si.stems[j].advAlign]
		].forEach(function(x) {
			if (!x[1].length) return;
			isalInvocations.push([
				x[1].map(z => z.id).concat([x[0]]),
				["SRP0"].concat(x[1].map(x => "MDRP[0]"))
			]);
		});
	}
	var isks = [];
	for (let da of si.diagAligns) {
		if (!da.zs || !da.zs.length) continue;
		for (let z of da.zs) {
			isks.push([da.l, da.r, z]);
		}
	}

	// Interpolations
	tt = tt.concat(
		invokesToInstrs(invocations, STACK_DEPTH),
		mirps,
		invokesToInstrs(
			[].concat(isalInvocations, ipsaInvokes(isks.concat(si.ipsacalls))),
			STACK_DEPTH
		)
	);

	tt.push("IUP[y]");
	return tt;
}

exports.instruct = instruct;
