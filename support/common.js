"use strict";

exports.mix = function(x, y, a) {
	return x + (y - x) * a;
};
exports.mixz = function(p, q, x) {
	return { x: p.x + (q.x - p.x) * x, y: p.y + (q.y - p.y) * x };
};
exports.lerp = function(x, x1, x2, y1, y2) {
	return (x - x1) / (x2 - x1) * (y2 - y1) + y1;
};
exports.xlerp = function(x, x1, x2, x3, y1, y2, y3) {
	if (x <= x2) {
		return (x - x1) / (x2 - x1) * (y2 - y1) + y1;
	} else {
		return (x - x2) / (x3 - x2) * (y3 - y2) + y2;
	}
};
exports.xclamp = function(low, x, high) {
	return x < low ? low : x > high ? high : x;
};

exports.leftmostZ_S = function(seg) {
	let m = seg[0];
	for (let z of seg) if (!m || (z && z.x < m.x)) m = z;
	return m;
};
exports.rightmostZ_S = function(seg) {
	let m = seg[0];
	for (let z of seg) if (!m || (z && z.x > m.x)) m = z;
	return m;
};

exports.leftmostZ_SS = function(segs) {
	let m = segs[0][0];
	for (let seg of segs) for (let z of seg) if (!m || (z && z.x < m.x)) m = z;
	return m;
};
exports.rightmostZ_SS = function(segs) {
	let m = segs[0][0];
	for (let seg of segs) for (let z of seg) if (!m || (z && z.x > m.x)) m = z;
	return m;
};

exports.expandZ = function expandZ(radical, z, dx, dy, maxticks) {
	let z1 = { x: z.x + dx, y: z.y + dy },
		steps = 0;
	while (radical.includesEdge(z1) && steps < maxticks) {
		z1.x += dx;
		z1.y += dy;
		steps++;
	}
	return z1;
};
