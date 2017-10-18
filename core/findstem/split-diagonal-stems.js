"use strict";

const Point = require("../types/").Point;
const { leftmostZ_SS: leftmostZ, rightmostZ_SS: rightmostZ } = require("./seg");

function shouldSplit(hl, ll, hr, lr, strategy) {
	if (hl === hr || ll === lr) return false;
	if (hl.y === hr.y || ll.y === lr.y) return false;
	if ((hl.on && ll.on && !hr.on && !lr.on) || (!hl.on && !ll.on && hr.on && lr.on)) {
		if (Point.adjacentZ(hl, hr) && Point.adjacentZ(ll, lr)) return false;
	}

	return (
		Math.abs(hr.y - hl.y) >= Math.abs(hr.x - hl.x) * strategy.SLOPE_FUZZ_R &&
		Math.abs(lr.y - ll.y) >= Math.abs(lr.x - ll.x) * strategy.SLOPE_FUZZ_R &&
		Math.abs(hl.x - hr.x) >= 2.5 * Math.max(Math.abs(hl.y - ll.y), Math.abs(hr.y - lr.y)) &&
		Math.abs(ll.x - lr.x) >= 2.5 * Math.max(Math.abs(hl.y - ll.y), Math.abs(hr.y - lr.y)) &&
		Math.abs(hl.x - ll.x) * 2.25 < Math.max(Math.abs(hl.x - hr.x), Math.abs(ll.x - lr.x)) &&
		Math.abs(hr.x - lr.x) * 2.25 < Math.max(Math.abs(hl.x - hr.x), Math.abs(ll.x - lr.x)) &&
		(Math.abs(hl.y - hr.y) >= strategy.Y_FUZZ_DIAG ||
			Math.abs(ll.y - lr.y) >= strategy.Y_FUZZ_DIAG)
	);
}
function contained(z1, z2, segs) {
	const fuzz = 1;
	for (let seg of segs)
		for (let z of seg) {
			if (
				(z.y > z1.y + fuzz && z.y > z2.y + fuzz) ||
				(z.y < z1.y - fuzz && z.y < z2.y - fuzz)
			) {
				return false;
			}
		}
	return true;
}
function linkIP(segs, hl, hr) {
	let ans = [];
	let unrel = [];
	for (let seg of segs) {
		let z = seg[0];
		if (z !== hl && z !== hr) {
			ans.push(z);
		}
		if (seg.length > 1 && seg[seg.length - 1] !== z) {
			let z = seg[seg.length - 1];
			if (z !== hl && z !== hr) {
				ans.push(z);
			}
		}
		for (let z of seg) if (z !== hl && z !== hr) unrel.push(z);
	}
	let res = { l: hl, r: hr, zs: ans, unrel: unrel };
	return res;
}
function splitDiagonalStem(s, strategy, rid, results) {
	let hl = leftmostZ(s.high);
	let ll = leftmostZ(s.low);
	let hr = rightmostZ(s.high);
	let lr = rightmostZ(s.low);

	if (
		shouldSplit(hl, ll, hr, lr, strategy) &&
		contained(ll, lr, s.low, strategy) &&
		contained(hl, hr, s.high, strategy)
	) {
		let hmx = (hl.x + hr.x) / 2;
		let lmx = (ll.x + lr.x) / 2;
		let hmy = (hl.y + hr.y) / 2;
		let lmy = (ll.y + lr.y) / 2;
		let sleft = {
			high: [[hl, new Point(hmx - 1, hmy, true, Point.PHANTOM)]],
			low: [[ll, new Point(lmx - 1, lmy, true, Point.PHANTOM)]],
			y: hl.y,
			atLeft: true,
			width: hl.y - ll.y,
			belongRadical: s.belongRadical,
			rid: rid
		};
		let sright = {
			high: [[new Point(hmx + 1, hmy, true, Point.PHANTOM), hr]],
			low: [[new Point(lmx + 1, lmy, true, Point.PHANTOM), lr]],
			y: hr.y,
			width: hr.y - lr.y,
			belongRadical: s.belongRadical,
			atRight: true,
			linkedIPsHigh: linkIP(s.high, hl, hr),
			linkedIPsLow: linkIP(s.low, ll, lr),
			rid: rid
		};
		if (hl.y > hr.y) {
			sleft.diagHigh = true;
			sright.diagLow = true;
		} else {
			sright.diagHigh = true;
			sleft.diagLow = true;
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
