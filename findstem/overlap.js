"use strict"
function byAt(p, q) { return p.at - q.at }
function overlapInfo(a, b, strategy) {
	var events = []
	for (var j = 0; j < a.length; j++) {
		var low = Math.min(a[j][0].x, a[j][a[j].length - 1].x);
		var high = Math.max(a[j][0].x, a[j][a[j].length - 1].x);
		if (low < high) {
			events.push({ at: low, on: true, a: true });
			events.push({ at: high, on: false, a: true });
		}
	}
	var probeb = new Array(strategy.UPM || 1000);
	for (var j = 0; j < b.length; j++) {
		var low = Math.min(b[j][0].x, b[j][b[j].length - 1].x);
		var high = Math.max(b[j][0].x, b[j][b[j].length - 1].x);
		if (low < high) {
			events.push({ at: low, on: true, a: false });
			events.push({ at: high, on: false, a: false });
		}
	}
	events.sort(byAt);
	var len = 0, la = 0, lb = 0;
	var st = 0, sa = 0, sb = 0;
	var ac = 0;
	var bc = 0;
	for (var j = 0; j < events.length; j++) {
		var e = events[j]
		var intersectBefore = ac * bc;
		var ab = ac, bb = bc;
		if (e.a) { if (e.on) ac += 1; else ac -= 1 }
		else { if (e.on) bc += 1; else bc -= 1 }
		if (ac * bc && !intersectBefore) st = e.at;
		if (!(ac * bc) && intersectBefore) len += e.at - st;
		if (ac && !ab) sa = e.at;
		if (!ac && ab) la += e.at - sa;
		if (bc && !bb) sb = e.at;
		if (!bc && bb) lb += e.at - sb;
	};
	return {
		len: len,
		la: la,
		lb: lb
	}
}

function overlapRatio(a, b, op, strategy) {
	var i = overlapInfo(a, b, strategy)
	return op(i.len / i.la, i.len / i.lb)
}

function stemOverlapRatio(a, b, op, strategy) {
	return Math.max(
		overlapRatio(a.low, b.low, op, strategy),
		overlapRatio(a.high, b.low, op, strategy),
		overlapRatio(a.low, b.high, op, strategy),
		overlapRatio(a.high, b.high, op, strategy))
}
function stemOverlapLength(a, b, strategy) {
	return Math.max(
		overlapInfo(a.low, b.low, strategy).len,
		overlapInfo(a.high, b.low, strategy).len,
		overlapInfo(a.low, b.high, strategy).len,
		overlapInfo(a.high, b.high, strategy).len
	) / strategy.UPM;
}


exports.overlapInfo = overlapInfo;
exports.overlapRatio = overlapRatio;
exports.stemOverlapRatio = stemOverlapRatio;
exports.stemOverlapLength = stemOverlapLength;
