"use strict"

var rtg = require('./roundings').rtg_raw;
var util = require('util');

function pushargs(tt) {
	var vals = [];
	for (var j = 1; j < arguments.length; j++) vals = vals.concat(arguments[j]);
	if (!vals.length) return;
	var datatype = 'B';
	var shortpush = vals.length <= 8;
	for (var j = 0; j < vals.length; j++) if (vals[j] < 0 || vals[j] > 255) datatype = 'W';
	if (shortpush) {
		tt.push('PUSH' + datatype + '_' + vals.length);
		for (var j = 0; j < vals.length; j++) tt.push(vals[j])
	} else if (vals.length < 250) {
		tt.push('NPUSH' + datatype);
		tt.push(vals.length);
		for (var j = 0; j < vals.length; j++) tt.push(vals[j])
	}
};
function invokesToInstrs(invocations, limit) {
	var stackSofar = [];
	var actionsSofar = [];
	var instrs = [];
	for (var j = 0; j < invocations.length; j++) {
		var arg = invocations[j][0];
		var action = invocations[j][1];
		if (stackSofar.length + arg.length > limit) {
			pushargs(instrs, stackSofar);
			instrs = instrs.concat(actionsSofar);
			stackSofar = [];
			actionsSofar = [];
		}
		stackSofar = arg.concat(stackSofar);
		actionsSofar = actionsSofar.concat(action);
	};
	pushargs(instrs, stackSofar);
	instrs = instrs.concat(actionsSofar);
	return instrs;
}

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
				invokes.push([[rp1], ['SRP1']])
			};
			if (cur_rp2 !== rp2) {
				cur_rp2 = rp2;
				invokes.push([[rp2], ['SRP2']])
			};
			invokes.push([[actions[k][2]], ['IP']])
		} else {
			// an short absorption
			var rp0 = actions[k][0];
			if (cur_rp0 !== rp0) {
				cur_rp0 = rp0;
				invokes.push([[rp0], ['SRP0']])
			};
			invokes.push([[actions[k][1]], ['MDRP[0]']])
		}
	};
	return invokes;
}

function pushInvokes(tt, invocations, STACK_DEPTH) {
	var invokeInstrs = invokesToInstrs(invocations, STACK_DEPTH);
	for (var j = 0; j < invokeInstrs.length; j++) {
		tt.push(invokeInstrs[j])
	}
	invocations.length = 0;
}

function instruct(glyph, actions, strategy, cvt, padding) {
	var padding = padding || 0;
	var upm = strategy.UPM || 1000;
	var cvtTopID = cvt.indexOf(strategy.BLUEZONE_TOP_CENTER, padding);
	var cvtBottomID = cvt.indexOf(strategy.BLUEZONE_BOTTOM_CENTER, padding);

	function decideDelta(gear, original, target, upm, ppem) {
		var rounded = rtg(original, upm, ppem);
		var d = Math.round(gear * (target - rounded) / (upm / ppem));
		var roundBias = (original - rounded) / (upm / ppem);
		if (roundBias >= 0.4375 && roundBias <= 0.5625) {
			// RTG rounds TK down, but it is close to the middle
			d -= 1
		} else if (roundBias >= -0.5625 && roundBias <= -0.4375) {
			d += 1
		};
		if (!d) return -1;
		if (d < -8 || d > 8) return -2;
		var selector = (d > 0 ? d + 7 : d + 8);
		var deltappem = (ppem - strategy.PPEM_MIN) % 16;
		return deltappem * 16 + selector;
	}

	var STACK_DEPTH = strategy.STACK_DEPTH || 200;
	var invocations = [];

	// if(!glyph.stems.length) return;
	var tt = ['SVTCA[y-axis]', 'RTG'];

	// Blue zone alignment instructions
	// Bottom
	for (var k = 0; k < glyph.bottomBluePoints.length; k++) {
		invocations.push([[glyph.bottomBluePoints[k], cvtBottomID], ['MIAP[rnd]']])
	};
	pushInvokes(tt, invocations, STACK_DEPTH);
	// Top
	// Normal cases:
	// Padding + 3 + ppem is the CVT index of top blue zone center.
	tt.push('PUSHB_1', strategy.PPEM_MIN, 'MPPEM', 'LTEQ', 'PUSHB_1', strategy.PPEM_MAX, 'MPPEM', 'GTEQ', 'AND', 'IF');
	tt.push('MPPEM');
	pushargs(tt, padding + 3);
	tt.push('ADD');
	for (var k = 0; k < glyph.topBluePoints.length; k++) {
		tt.push('DUP');
		pushargs(tt, glyph.topBluePoints[k]);
		tt.push('SWAP', 'MIAP[0]'); // Don't round top absorptions
	};
	tt.push('CLEAR');
	tt.push('ELSE');
	for (var k = 0; k < glyph.topBluePoints.length; k++) {
		invocations.push([[glyph.topBluePoints[k], cvtTopID], ['MIAP[rnd]']])
	};
	pushInvokes(tt, invocations, STACK_DEPTH);
	tt.push('EIF');


	// Microsoft eats my deltas, I have to add additional MDAPs
	// cf. http://www.microsoft.com/typography/cleartype/truetypecleartype.aspx#Toc227035721
	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			invocations.push([[glyph.stems[k].posKey], ['MDAP[0]']]);
			invocations.push([[glyph.stems[k].advKey], ['MDAP[0]']]);
		};
	};


	invocations.push([[1, strategy.PPEM_MIN], ['SDB', 'SDS']]);
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
				var y = instrs[k][0], w = instrs[k][1];
				var stem = glyph.stems[k];
				var y0 = stem.y0, w0 = stem.w0, orient = stem.posKeyAtTop;
				if (orient) {
					var ypos = y * uppx;
					var ypos0 = y0;
				} else {
					var ypos = (y - w) * uppx;
					var ypos0 = y0 - w0;
				}

				var d = decideDelta(2, ypos0, ypos, upm, ppem);
				if (d >= 0) deltas.push({ id: stem.posKey, delta: d });

				var originalAdvKeyPosition = ypos0 + (orient ? (-1) : 1) * w0;
				var targetAdvKeyPosition = ypos + (orient ? (-1) : 1) * w * (upm / ppem);
				var d = decideDelta(2, originalAdvKeyPosition, targetAdvKeyPosition, upm, ppem);

				if (d >= 0) {
					deltas.push({ id: stem.advKey, delta: d });
				} else if (d === -1) {
					// IGNORE
				} else if (Math.round(w0 / uppx) === w && Math.abs(w0 / uppx - w) < 0.48) {
					args.push(stem.advKey, stem.posKey);
					movements.push('MDRP[rnd,grey]', 'SRP0');
				} else {
					var cvtwidth = (orient ? (-1) : 1) * Math.round(upm / ppem * w);
					var cvtj = cvt.indexOf(cvtwidth, padding);
					if (cvtj >= 0) {
						args.push(stem.advKey, cvtj, stem.posKey);
						movements.push('MIRP[0]', 'SRP0');
					} else {
						var msirpwidth = (orient ? (-1) : 1) * (w * 64);
						args.push(stem.advKey, msirpwidth, stem.posKey);
						movements.push('MSIRP[0]', 'SRP0');
					}
				};
			};
			if (deltas.length) {
				var deltapArgs = [];
				for (var j = 0; j < deltas.length; j++) {
					deltapArgs.push(deltas[j].delta, deltas[j].id)
				};
				deltaCalls.push([deltapArgs, ['DELTAP' + (1 + Math.floor((ppem - strategy.PPEM_MIN) / 16))], ppem]);
			};
			var ppemSpecificMRPs = [];
			if (args.length) {
				pushargs(ppemSpecificMRPs, args)
				ppemSpecificMRPs = ppemSpecificMRPs.concat(movements.reverse());
			};
			if (ppemSpecificMRPs.length) {
				mirps.push('MPPEM', 'PUSHB_1', ppem, 'EQ', 'IF');
				mirps = mirps.concat(ppemSpecificMRPs);
				mirps.push('EIF');
			}
		}
	};
	if (deltaCalls.length) {
		var currentDeltaCall = [deltaCalls[0][0].slice(0), deltaCalls[0][1].slice(0)];
		for (var j = 1; j < deltaCalls.length; j++) {
			if (deltaCalls[j][1][0] === currentDeltaCall[1][0] && currentDeltaCall[0].length + deltaCalls[j][0].length < STACK_DEPTH - 10) {// Same Instruction
				currentDeltaCall[0] = currentDeltaCall[0].concat(deltaCalls[j][0]);
			} else {
				currentDeltaCall[0].push(currentDeltaCall[0].length >> 1);
				invocations.push(currentDeltaCall);
				currentDeltaCall = [deltaCalls[j][0].slice(0), deltaCalls[j][1].slice(0)]
			}
		}
		currentDeltaCall[0].push(currentDeltaCall[0].length >> 1);
		invocations.push(currentDeltaCall);
	}

	mirps.push('PUSHB_1', strategy.PPEM_MAX, 'MPPEM', 'LT', 'IF');
	var largeMdrpInvokes = [];
	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			largeMdrpInvokes.push([[glyph.stems[k].posKey], ['SRP0']],
				[[glyph.stems[k].advKey], ['MDRP[0]']]
			)
		}
	}
	pushInvokes(mirps, largeMdrpInvokes, STACK_DEPTH);
	mirps.push('EIF');

	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			invocations.push([[glyph.stems[k].posKey], ['MDAP[rnd]']]);
			invocations.push([[glyph.stems[k].advKey], ['MDAP[rnd]']]);
		};
	};

	// In-stem alignments
	var isalInvocations = [];
	for (var j = 0; j < glyph.stems.length; j++) {
		[[glyph.stems[j].posKey, glyph.stems[j].posAlign], [glyph.stems[j].advKey, glyph.stems[j].advAlign]].forEach(function (x) {
			if (x[1].length) {
				isalInvocations.push([x[1].concat([x[0]]), ['SRP0'].concat(x[1].map(function (x) { return 'MDRP[0]' }))]);
			}
		});
	};

	// Interpolations
	tt = tt.concat(
		invokesToInstrs(invocations, STACK_DEPTH),
		mirps,
		invokesToInstrs([].concat(
			ipsaInvokes(glyph.ipsacalls),
			isalInvocations
		), STACK_DEPTH));

	tt.push('IUP[y]');
	return tt;
};

exports.instruct = instruct;