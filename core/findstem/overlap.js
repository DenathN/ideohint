"use strict";

const {
	leftmostZ_S: leftmostZ,
	rightmostZ_S: rightmostZ,
	expandZ
} = require("../../support/common");
const slopeOf = require("../types/").slopeOf;

function byAt(p, q) {
	return p.at - q.at;
}
function pushEvents(events, seg, radical, s, isA) {
	let z0 = leftmostZ(seg),
		zm = rightmostZ(seg);
	// once radical is present we would expand the segments
	// so that the overlapping factor would be more accurate
	if (radical) {
		z0 = expandZ(radical, z0, -1, -s, 1000);
		zm = expandZ(radical, zm, 1, s, 1000);
	}
	if (z0.x < zm.x) {
		events.push({ at: z0.x, on: true, a: isA });
		events.push({ at: zm.x, on: false, a: isA });
	}
}

function overlapInfo(a, b, radical) {
	const slopeA = slopeOf(a),
		slopeB = slopeOf(b);
	let events = [];
	for (let j = 0; j < a.length; j++) {
		pushEvents(events, a[j], radical, slopeA, true);
	}
	for (let j = 0; j < b.length; j++) {
		pushEvents(events, b[j], radical, slopeB, false);
	}
	events.sort(byAt);
	let len = 0,
		la = 0,
		lb = 0;
	let st = 0,
		sa = 0,
		sb = 0;
	let ac = 0;
	let bc = 0;
	for (let j = 0; j < events.length; j++) {
		const e = events[j];
		const intersectBefore = ac * bc;
		const ab = ac,
			bb = bc;
		if (e.a) {
			if (e.on) ac += 1;
			else ac -= 1;
		} else {
			if (e.on) bc += 1;
			else bc -= 1;
		}
		if (ac * bc && !intersectBefore) st = e.at;
		if (!(ac * bc) && intersectBefore) len += e.at - st;
		if (ac && !ab) sa = e.at;
		if (!ac && ab) la += e.at - sa;
		if (bc && !bb) sb = e.at;
		if (!bc && bb) lb += e.at - sb;
	}
	return {
		len: len,
		la: la,
		lb: lb
	};
}

function overlapRatio(a, b, op) {
	const i = overlapInfo(a, b);
	return op(i.len / i.la, i.len / i.lb);
}

function stemOverlapRatio(a, b, op) {
	return Math.max(
		overlapRatio(a.low, b.low, op),
		overlapRatio(a.high, b.low, op),
		overlapRatio(a.low, b.high, op),
		overlapRatio(a.high, b.high, op)
	);
}
function stemOverlapLength(a, b, strategy) {
	return (
		Math.max(
			overlapInfo(a.low, b.low).len,
			overlapInfo(a.high, b.low).len,
			overlapInfo(a.low, b.high).len,
			overlapInfo(a.high, b.high).len
		) / strategy.UPM
	);
}

exports.overlapInfo = overlapInfo;
exports.overlapRatio = overlapRatio;
exports.stemOverlapRatio = stemOverlapRatio;
exports.stemOverlapLength = stemOverlapLength;
