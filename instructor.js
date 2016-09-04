"use strict"

var rtg = require('./roundings').rtg_raw;

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

function by_rp(a, b) { return a[0] - b[0] || a[1] - b[1] }
function ipInvokes(actions) {
	var invokes = [];
	actions = actions.sort(by_rp);
	var cur_rp1 = -1;
	var cur_rp2 = -1;
	for (var k = 0; k < actions.length; k++) {
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
	};
	return invokes;
}
function shortMdrpInvokes(actions) {
	var invokes = [];
	actions = actions.sort(by_rp);
	var cur_rp0 = 0;
	for (var k = 0; k < actions.length; k++) {
		var rp0 = actions[k][0];
		if (cur_rp0 !== rp0) {
			cur_rp0 = rp0;
			invokes.push([[rp0], ['SRP0']])
		};
		invokes.push([[actions[k][1]], ['MDRP[0]']])
	};
	return invokes;
}

function instruct(glyph, actions, strategy, cvt, padding, useMDRPnr) {
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
	tt.push('PUSHB_1', strategy.PPEM_MIN, 'MPPEM', 'LTEQ', 'PUSHB_1', strategy.PPEM_MAX, 'MPPEM', 'GT', 'AND', 'IF');

	// Blue zone alignment instructions
	// Bottom
	for (var k = 0; k < glyph.bottomBluePoints.length; k++) {
		invocations.push([[glyph.bottomBluePoints[k], cvtBottomID], ['MIAP[rnd]']])
	};
	tt = tt.concat(invokesToInstrs(invocations, STACK_DEPTH));
	invocations = [];
	// Padding + 3 + ppem is the CVT index of top blue zone center.
	tt.push('MPPEM');
	pushargs(tt, padding + 3);
	tt.push('ADD');
	for (var k = 0; k < glyph.topBluePoints.length; k++) {
		tt.push('DUP');
		pushargs(tt, glyph.topBluePoints[k]);
		tt.push('SWAP', 'MIAP[0]'); // Don't round top absorptions
	};
	tt.push('CLEAR');

	// Microsoft eats my deltas, i have to add additional MDAPs
	// cf. http://www.microsoft.com/typography/cleartype/truetypecleartype.aspx#Toc227035721
	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			invocations.push([[glyph.stems[k].posKey.id], ['MDAP[0]']]);
			invocations.push([[glyph.stems[k].advKey.id], ['MDAP[0]']]);
		};
	};


	var deltaInstructions = [];
	invocations.push([[1, strategy.PPEM_MIN], ['SDB', 'SDS']]);

	var mirps = [];
	if (glyph.stems.length) {
		for (var ppem = 0; ppem < actions.length; ppem++) {
			if (actions[ppem]) {
				var instrs = actions[ppem];
				var deltas = [];
				var args = [];
				var movements = [];
				for (var k = 0; k < instrs.length; k++) {
					var d = decideDelta(2, instrs[k].pos[2], instrs[k].pos[3], upm, ppem);
					if (d >= 0) deltas.push({ id: instrs[k].pos[1], delta: d });

					if (instrs[k].adv.length > 4) {
						var touchedStemWidthPixels = (instrs[k].adv[4] || 0);
						var originalStemWidthPixels = (instrs[k].adv[3] || 0);
						var originalAdvKeyPosition = instrs[k].pos[2] + (instrs[k].orient ? (-1) : 1) * instrs[k].adv[3] * (upm / ppem);
						var targetAdvKeyPosition = instrs[k].pos[3] + (instrs[k].orient ? (-1) : 1) * instrs[k].adv[4] * (upm / ppem);
						var d = decideDelta(2, originalAdvKeyPosition, targetAdvKeyPosition, upm, ppem);
						if (d >= 0) {
							deltas.push({ id: instrs[k].adv[2], delta: d });
						} else if (d === -1) {
							// IGNORE
						} else if (Math.round(originalStemWidthPixels) === touchedStemWidthPixels && Math.abs(originalStemWidthPixels - touchedStemWidthPixels) < 0.48) {
							args.push(instrs[k].adv[2], instrs[k].pos[1]);
							movements.push('MDRP[rnd,grey]', 'SRP0');
						} else {
							var cvtwidth = (instrs[k].orient ? (-1) : 1) * Math.round(upm / ppem * touchedStemWidthPixels);
							var cvtj = cvt.indexOf(cvtwidth, padding);
							if (cvtj >= 0) {
								args.push(instrs[k].adv[2], cvtj, instrs[k].pos[1]);
								movements.push('MIRP[0]', 'SRP0');
							} else {
								process.stderr.write([ppem, touchedStemWidthPixels, (instrs[k].orient ? (-1) : 1) * Math.round(upm / ppem * touchedStemWidthPixels)] + '\n')
								var msirpwidth = (instrs[k].orient ? (-1) : 1) * ((instrs[k].adv[3] | 0) * 64);
								args.push(instrs[k].adv[2], msirpwidth, instrs[k].pos[1]);
								movements.push('MSIRP[0]', 'SRP0');
							}
						};
					} else {
						args.push(instrs[k].adv[2], instrs[k].pos[1]);
						movements.push('MDRP[0]', 'SRP0');
					}
				};
				if (deltas.length) {
					var deltapArgs = [];
					for (var j = 0; j < deltas.length; j++) {
						deltapArgs.push(deltas[j].delta, deltas[j].id)
					};
					deltapArgs.push(deltapArgs.length >> 1);
					invocations.push([deltapArgs, ['DELTAP' + (1 + Math.floor((ppem - strategy.PPEM_MIN) / 16))]])
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
	};

	if (glyph.stems.length) {
		for (var k = 0; k < glyph.stems.length; k++) {
			invocations.push([[glyph.stems[k].posKey.id], ['MDAP[rnd]']]);
			invocations.push([[glyph.stems[k].advKey.id], ['MDAP[rnd]']]);
		};
	};

	var isalInvocations = [];
	// In-stem alignments
	for (var j = 0; j < glyph.stems.length; j++) {
		[[glyph.stems[j].posKey.id, glyph.stems[j].posAlign], [glyph.stems[j].advKey.id, glyph.stems[j].advAlign]].forEach(function (x) {
			if (x[1].length) {
				isalInvocations.push([x[1].concat([x[0]]), ['SRP0'].concat(x[1].map(function (x) { return 'MDRP[0]' }))]);
			}
		});
	};

	var ip = [[], [], [], [], []];
	var sa = [[], [], [], [], []];
	for (var j = 0; j < glyph.interpolations.length; j++) {
		ip[glyph.interpolations[j][3]].push(glyph.interpolations[j])
	}
	for (var j = 0; j < glyph.shortAbsorptions.length; j++) {
		sa[glyph.shortAbsorptions[j][2]].push(glyph.shortAbsorptions[j])
	}
	var ipsacalls = [];
	for (var j = ip.length - 1; j >= 0; j--) {
		ipsacalls = ipsacalls.concat(ipInvokes(ip[j]), shortMdrpInvokes(sa[j]))
	}

	// Interpolations
	tt = tt.concat(
		invokesToInstrs(invocations, STACK_DEPTH),
		mirps,
		invokesToInstrs([].concat(
			ipsacalls,
			isalInvocations
		), STACK_DEPTH));

	tt.push('EIF', 'IUP[y]');
	return tt.join("\n")
};

exports.instruct = instruct;