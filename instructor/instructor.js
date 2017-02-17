"use strict";

var roundings = require("../roundings");
var util = require("util");
var pushargs = require("./invoke").pushargs;
var invokesToInstrs = require("./invoke").invokesToInstrs;
var pushInvokes = require("./invoke").pushInvokes;

function ipsaInvokes(actions) {
	if (!actions) return [];
	var invokes = [];
	var cur_rp0 = -1;
	var cur_rp1 = -1;
	var cur_rp2 = -1;
	for (var k = 0; k < actions.length; k++) {
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

function instruct(glyph, actions, strategy, cvt, padding) {
	var padding = padding || 0;
	var upm = strategy.UPM || 1000;
	var cvtTopID = cvt.indexOf(strategy.BLUEZONE_TOP_CENTER, padding);
	var cvtBottomID = cvt.indexOf(strategy.BLUEZONE_BOTTOM_CENTER, padding);

	const ROUNDING_CUTOFF = 1 / 2 - 1 / 32;
	const HALF_PIXEL_PPEM = 20;
	const SDS = 3;
	const GEAR = 8;

	function encodeDelta(d, ppem) {
		if (!d) return [];
		if (d < -8) {
			return encodeDelta(-8, ppem).concat(encodeDelta(d + 8, ppem));
		}
		if (d > 8) {
			return encodeDelta(8, ppem).concat(encodeDelta(d - 8, ppem));
		}
		var selector = (d > 0 ? d + 7 : d + 8);
		var deltappem = (ppem - strategy.PPEM_MIN) % 16;
		return [deltappem * 16 + selector];
	}

	function pushDelta(deltas, id, d) {
		for (let term of d) {
			deltas.push({ id: id, delta: term });
		}
	}

	function decideDelta(gear, original, target, upm, ppem) {
		var d = Math.round(gear * (target - original) / (upm / ppem));
		return encodeDelta(d, ppem);
	}

	function decideDeltaShift(gear, sign, isStrict, isStacked, base0, dist0, base1, dist1, upm, ppem) {
		var y1 = base0 + sign * dist0;
		var y2 = base1 + sign * dist1;
		var yDesired = isStacked ? base1 : base1 + sign * dist0;
		var deltaStart = Math.round(gear * (y2 - y1) / (upm / ppem));
		var deltaDesired = Math.round(gear * (yDesired - y1) / (upm / ppem));
		var delta = deltaStart - deltaDesired;
		// We will try to reduce delta to 0 when there is "enough space".
		while (!(dist0 < dist1 && dist1 <= (1 + 1 / 16) * (upm / ppem) && !isStacked) && delta) {
			const delta1 = (delta > 0 ? delta - 1 : delta + 1);
			const y2a = y1 + (deltaDesired + delta1) * (upm / ppem) / gear;
			if (roundings.rtg(y2 - base1, upm, ppem) !== roundings.rtg(y2a - base1, upm, ppem) // wrong pixel!
				|| Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > ROUNDING_CUTOFF * (upm / ppem)
				|| (dist0 > dist1)
				&& Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > (1 / 2) * (upm / ppem) * (ppem / HALF_PIXEL_PPEM)
				|| isStrict && (Math.abs(y2 - base1 - (y2a - base1)) > (upm / ppem) * (3 / 16))) break;
			delta = (delta > 0 ? delta - 1 : delta + 1);
		}
		// process.stderr.write(`${delta0} -> ${delta} @ ${ppem}` + "\n");
		return encodeDelta(delta + deltaDesired, ppem);
	}

	var STACK_DEPTH = strategy.STACK_DEPTH || 200;
	var invocations = [];

	// if(!glyph.stems.length) return;
	var tt = ["SVTCA[y-axis]", "RTG"];

	// Blue zone alignment instructions
	// Bottom
	for (var k = 0; k < glyph.bottomBluePoints.length; k++) {
		invocations.push([[glyph.bottomBluePoints[k], cvtBottomID], ["MIAP[rnd]"]]);
	}
	pushInvokes(tt, invocations, STACK_DEPTH);
	// Top
	// Normal cases:
	// Padding + 3 + ppem is the CVT index of top blue zone center.
	tt.push("PUSHB_1", strategy.PPEM_MIN, "MPPEM", "LTEQ", "PUSHB_1", strategy.PPEM_MAX, "MPPEM", "GTEQ", "AND", "IF");
	tt.push("MPPEM");
	pushargs(tt, padding + 3);
	tt.push("ADD");
	for (var k = 0; k < glyph.topBluePoints.length; k++) {
		tt.push("DUP");
		pushargs(tt, glyph.topBluePoints[k]);
		tt.push("SWAP", "MIAP[0]"); // Don't round top absorptions
	}
	tt.push("CLEAR");
	tt.push("ELSE");
	for (var k = 0; k < glyph.topBluePoints.length; k++) {
		invocations.push([[glyph.topBluePoints[k], cvtTopID], ["MIAP[rnd]"]]);
	}
	pushInvokes(tt, invocations, STACK_DEPTH);
	tt.push("EIF");


	// Microsoft eats my deltas, I have to add additional MDAPs
	// cf. http://www.microsoft.com/typography/cleartype/truetypecleartype.aspx#Toc227035721
	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			invocations.push([[glyph.stems[k].posKey], ["MDAP[rnd]"]]);
			invocations.push([[glyph.stems[k].advKey], ["MDRP[0]"]]);
		}
	}


	invocations.push([[SDS, strategy.PPEM_MIN], ["SDB", "SDS"]]);
	var deltaCalls = [];
	var mirps = [];
	if (glyph.stems.length) for (var ppem = 0; ppem < actions.length; ppem++) {
		var uppx = upm / ppem;
		if (actions[ppem]) {
			// The instes' length sould be exactly glyph.stems.length.
			var instrs = actions[ppem];
			var deltas = [];
			var args = [];
			var movements = [];
			for (var k = 0; k < instrs.length; k++) {
				var [y, w, isStrict, isStacked] = instrs[k];
				var stem = glyph.stems[k];
				var y0 = stem.y0, w0 = stem.w0, orient = stem.posKeyAtTop;
				if (orient) {
					var ypos = y * uppx;
					var ypos0 = roundings.rtg(y0, upm, ppem);
				} else {
					var ypos = (y - w) * uppx;
					var ypos0 = roundings.rtg(y0 - w0, upm, ppem);
				}

				pushDelta(deltas, stem.posKey, decideDelta(GEAR, ypos0, ypos, upm, ppem));

				var originalAdvKeyPosition = w0;
				var targetAdvKeyPosition = w * (upm / ppem);
				pushDelta(deltas, stem.advKey, decideDeltaShift(
					GEAR, orient ? -1 : 1,
					isStrict, isStacked,
					ypos0, originalAdvKeyPosition,
					ypos, targetAdvKeyPosition,
					upm, ppem));
			}
			if (deltas.length) {
				var deltapArgs = [];
				for (var j = 0; j < deltas.length; j++) {
					deltapArgs.push(deltas[j].delta, deltas[j].id);
				}
				deltaCalls.push([deltapArgs, ["DELTAP" + (1 + Math.floor((ppem - strategy.PPEM_MIN) / 16))], ppem]);
			}
			var ppemSpecificMRPs = [];
			if (args.length) {
				pushargs(ppemSpecificMRPs, args);
				ppemSpecificMRPs = ppemSpecificMRPs.concat(movements.reverse());
			}
			if (ppemSpecificMRPs.length) {
				mirps.push("MPPEM", "PUSHB_1", ppem, "EQ", "IF");
				mirps = mirps.concat(ppemSpecificMRPs);
				mirps.push("EIF");
			}
		}
	}

	if (deltaCalls.length) {
		var currentDeltaCall = [deltaCalls[0][0].slice(0), deltaCalls[0][1].slice(0)];
		for (var j = 1; j < deltaCalls.length; j++) {
			if (deltaCalls[j][1][0] === currentDeltaCall[1][0] && currentDeltaCall[0].length + deltaCalls[j][0].length < STACK_DEPTH - 10) { // Same Instruction
				currentDeltaCall[0] = currentDeltaCall[0].concat(deltaCalls[j][0]);
			} else {
				currentDeltaCall[0].push(currentDeltaCall[0].length >> 1);
				invocations.push(currentDeltaCall);
				currentDeltaCall = [deltaCalls[j][0].slice(0), deltaCalls[j][1].slice(0)];
			}
		}
		currentDeltaCall[0].push(currentDeltaCall[0].length >> 1);
		invocations.push(currentDeltaCall);
	}

	mirps.push("PUSHB_1", strategy.PPEM_MAX, "MPPEM", "LT", "IF");
	var largeMdrpInvokes = [];
	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			largeMdrpInvokes.push([[glyph.stems[k].posKey], ["SRP0"]],
				[[glyph.stems[k].advKey], ["MDRP[0]"]]
			);
		}
	}
	pushInvokes(mirps, largeMdrpInvokes, STACK_DEPTH);
	mirps.push("EIF");

	// In-stem alignments
	var isalInvocations = [];
	for (var j = 0; j < glyph.stems.length; j++) {
		[[glyph.stems[j].posKey, glyph.stems[j].posAlign], [glyph.stems[j].advKey, glyph.stems[j].advAlign]].forEach(function (x) {
			if (x[1].length) {
				isalInvocations.push([x[1].concat([x[0]]), ["SRP0"].concat(x[1].map(function (x) { return "MDRP[0]"; }))]);
			}
		});
	}

	// Interpolations
	tt = tt.concat(
		invokesToInstrs(invocations, STACK_DEPTH),
		mirps,
		invokesToInstrs([].concat(
			isalInvocations,
			ipsaInvokes(glyph.ipsacalls)
		), STACK_DEPTH));

	tt.push("IUP[y]");
	return tt;
}

exports.instruct = instruct;
