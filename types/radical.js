"use strict";

const mixz = require('../support/common').mixz;

function Radical(outline) {
	this.outline = outline;
	this.holes = [];
	this.subs = [];
	this.segments = [];
}
Radical.prototype.includes = function (z) {
	if (!this.outline.includesPoint(z)) return false;
	for (var j = 0; j < this.holes.length; j++) {
		if (this.holes[j].includesPoint(z)) return false;
	}
	return true;
};
Radical.prototype.includesSegment = function (z1, z2) {
	var SEGMENTS = 64;
	for (var s = 1; s < SEGMENTS; s++) {
		var testz = {
			x: z2.x + (z1.x - z2.x) * (s / SEGMENTS),
			y: z2.y + (z1.y - z2.y) * (s / SEGMENTS)
		};
		if (!this.includes(testz)) { return false; }
	}
	return true;
};
Radical.prototype.includesSegmentEdge = function (z1, z2, umx, deltax, umy, deltay) {
	if (this.includesSegment(z1, z2)) {
		return true;
	}
	for (var u1 = -umx; u1 <= umx; u1++) for (var u2 = -umy; u2 <= umy; u2++)
		for (var u3 = -umx; u3 <= umx; u3++) for (var u4 = -umy; u4 <= umy; u4++) {
			var z1a = { x: z1.x + u1 * deltax, y: z1.y + u2 * deltay };
			var z2a = { x: z2.x + u3 * deltax, y: z2.y + u4 * deltay };
			if (this.includesSegment(z1a, z2a)) {
				return true;
			}
		}
	//console.log("IXS", z1, z2, umx, deltax, umy, deltay);
	return false;
};
Radical.prototype.includesTetragon = function (s1, s2) {
	for (var u = 0; u < s1.length - 1; u++) {
		for (var v = 0; v < s2.length - 1; v++) {
			var p = s1[u], q = s1[u + 1];
			var r = s2[v], s = s2[v + 1];
			if (p.x > q.x) {
				var t = p;
				p = q; q = t;
			}
			if (r.x > s.x) {
				var t = r;
				r = s; s = t;
			}
			const cross1 = r.x > q.x;
			const cross2 = p.x > s.x;
			const q1 = (u === 0 || u === s1.length - 1 || v === 0 || v === s2.length - 1) ? 5 : 2;
			if (p.y === q.y && r.y === s.y) {
				if (!this.includesSegmentEdge(p, r, 1, 1, 1, 1)) return false;
				if (!this.includesSegmentEdge(q, s, 1, 1, 1, 1)) return false;
				if (!(cross1 || this.includesSegmentEdge(p, s, 1, 3, 1, 2))) return false;
				if (!(cross2 || this.includesSegmentEdge(q, r, 1, 3, 1, 2))) return false;
				if (!this.includesSegmentEdge(mixz(p, q, 1 / 2), mixz(r, s, 1 / 2), 2, 2, 2, 2)) return false;
				if (!this.includesSegmentEdge(mixz(p, q, 1 / 5), mixz(r, s, 1 / 5), 2, 2, 2, 2)
					|| !this.includesSegmentEdge(mixz(p, q, 4 / 5), mixz(r, s, 4 / 5), 2, 2, 2, 2)) return false;
			} else {
				if (
					!this.includesSegmentEdge(mixz(p, q, 1 / 2), mixz(r, s, 1 / 2), 2, 2, 2, 2)
					|| !(cross1 || this.includesSegmentEdge(p, s, q1, 3, 2, 2))
					|| !(cross2 || this.includesSegmentEdge(q, r, q1, 3, 2, 2))
					|| !this.includesSegmentEdge(p, r, q1, 5, 2, 2)
					|| !this.includesSegmentEdge(q, s, q1, 5, 2, 2)
					|| !this.includesSegmentEdge(p, mixz(r, s, 1 / 2), q1, 5, 2, 2)
					|| !this.includesSegmentEdge(q, mixz(r, s, 1 / 2), q1, 5, 2, 2)
					|| !this.includesSegmentEdge(mixz(p, q, 1 / 2), r, q1, 5, 2, 2)
					|| !this.includesSegmentEdge(mixz(p, q, 1 / 2), s, q1, 5, 2, 2)
					|| !this.includesSegmentEdge(mixz(p, q, 1 / 5), mixz(r, s, 1 / 5), q1, 5, 2, 2)
					|| !this.includesSegmentEdge(mixz(p, q, 4 / 5), mixz(r, s, 4 / 5), q1, 5, 2, 2)
				) {
					return false;
				}
			}
		}
	}
	return true;
};
module.exports = Radical;
