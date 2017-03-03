"use strict"

// diagonal split
function leftmostZ(segs) {
	let m = segs[0][0];
	for (let seg of segs) for (let z of seg) if (!m || z && z.x < m.x) m = z;
	return m;
}
function rightmostZ(segs) {
	let m = segs[0][0];
	for (let seg of segs) for (let z of seg) if (!m || z && z.x > m.x) m = z;
	return m;
}
function isDiagonal(hl, ll, hr, lr, strategy) {
	if (hl === hr || ll === lr) return false;
	if (hl.y === hr.y || ll.y === lr.y) return false;
	return Math.abs(hr.y - hl.y) >= Math.abs(hr.x - hl.x) * strategy.SLOPE_FUZZ_R
		&& Math.abs(lr.y - ll.y) >= Math.abs(lr.x - ll.x) * strategy.SLOPE_FUZZ_R
		&& Math.abs(hl.x - ll.x) * 6 <= Math.max(Math.abs(hl.x - hr.x), Math.abs(ll.x - lr.x))
		&& Math.abs(hr.x - lr.x) * 6 <= Math.max(Math.abs(hl.x - hr.x), Math.abs(ll.x - lr.x));
}
function linkIP(segs, hl, hr) {
	let ans = [];
	let unrel = [];
	for (let seg of segs) {
		let z = seg[0];
		if (z !== hl && z !== hr) { ans.push(z); }
		if (seg.length > 1 && seg[seg.length - 1] !== z) {
			let z = seg[seg.length - 1];
			if (z !== hl && z !== hr) { ans.push(z); }
		}
		for (let z of seg) if (z !== hl && z !== hr) unrel.push(z);
	}
	let res = { l: hl, r: hr, zs: ans, unrel: unrel }
	return res;
}
function splitDiagonalStem(s, strategy, rid, results) {
	let hl = leftmostZ(s.high);
	let ll = leftmostZ(s.low);
	let hr = rightmostZ(s.high);
	let lr = rightmostZ(s.low);
	if (isDiagonal(hl, ll, hr, lr, strategy)) {
		let hmx = (hl.x + hr.x) / 2;
		let lmx = (ll.x + lr.x) / 2;
		let hmy = (hl.y + hr.y) / 2;
		let lmy = (ll.y + lr.y) / 2;
		let sleft = {
			high: [[hl, { x: hmx - 1, y: hmy, on: true, id: -1 }]],
			low: [[ll, { x: lmx - 1, y: lmy, on: true, id: -1 }]],
			y: hl.y,
			width: hl.y - ll.y,
			belongRadical: s.belongRadical,
			rid: rid
		}
		let sright = {
			high: [[{ x: hmx + 1, y: hmy, on: true, id: -1 }, hr]],
			low: [[{ x: lmx + 1, y: lmy, on: true, id: -1 }, lr]],
			y: hr.y,
			width: hr.y - lr.y,
			belongRadical: s.belongRadical,
			atRight: true,
			linkedIPsHigh: linkIP(s.high, hl, hr),
			linkedIPsLow: linkIP(s.low, ll, lr),
			rid: rid
		}
		if (hl.y > hr.y) {
			sleft.diagHigh = true
			sright.diagLow = true
		} else {
			sright.diagHigh = true
			sleft.diagLow = true
		}
		results.push(sleft, sright);
	} else {
		results.push(s);
	}
}
function splitDiagonalStems(ss, strategy) {
	var ans = [];
	let rid = 1;
	for (let s of ss) {
		splitDiagonalStem(s, strategy, rid, ans);
		rid += 1;
	}
	return ans;
}
exports.splitDiagonalStems = splitDiagonalStems;
exports.splitDiagonalStem = splitDiagonalStem;