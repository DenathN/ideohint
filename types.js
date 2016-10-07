"use strict";

function Point (x, y, on, id) {
	this.xori = x;
	this.yori = y;
	this.xtouch = x;
	this.ytouch = y;
	this.touched = false;
	this.donttouch = false;
	this.on = on;
	this.id = id;
	this.interpolated = id < 0;
}
function Contour () {
	this.points = [];
	this.ccw = false;
}

function checkExtrema (prev, z, next) {
	if (
		z.yori > prev.yori && z.yori >= next.yori || z.yori < prev.yori && z.yori <= next.yori) {
		z.yExtrema = true;
		z.yStrongExtrema = z.yori > prev.yori + 1 && z.yori > next.yori + 1
			|| z.yori < prev.yori - 1 && z.yori < next.yori - 1;
	}
	if (
		z.xori > prev.xori && z.xori >= next.xori || z.xori < prev.xori && z.xori <= next.xori) {
		z.xExtrema = true;
		z.xStrongExtrema = z.xori > prev.xori + 1 && z.xori > next.xori + 1
			|| z.xori < prev.xori - 1 && z.xori < next.xori - 1;
		if (z.xStrongExtrema) {
			z.atleft = z.xori < prev.xori - 1 && z.xori < next.xori - 1;
		}
	}
}

Contour.prototype.stat = function () {
	var points = this.points;
	checkExtrema(points[points.length - 2], points[0], points[1]);
	checkExtrema(points[points.length - 2], points[points.length - 1], points[1]);
	for (var j = 1; j < points.length - 1; j++) {
		checkExtrema(points[j - 1], points[j], points[j + 1]);
	}
	var xoris = this.points.map(function (p) { return p.xori; });
	var yoris = this.points.map(function (p) { return p.yori; });
	this.xmax = Math.max.apply(Math, xoris);
	this.ymax = Math.max.apply(Math, yoris);
	this.xmin = Math.min.apply(Math, xoris);
	this.ymin = Math.min.apply(Math, yoris);
	this.orient();
};
function setHidden (obj, prop, v) {
	Object.defineProperty(obj, prop, { value: v, enumerable: false, configurable: true });
}
Contour.prototype.orient = function () {
	// Findout PYmin
	var jm = 0, ym = this.points[0].yori;
	for (var j = 0; j < this.points.length - 1; j++) if (this.points[j].yori < ym) {
			jm = j; ym = this.points[j].yori;
	}
	var p0 = this.points[(jm ? jm - 1 : this.points.length - 2)], p1 = this.points[jm], p2 = this.points[jm + 1];
	var x = ((p0.xori - p1.xori) * (p2.yori - p1.yori) - (p0.yori - p1.yori) * (p2.xori - p1.xori));
	if (x < 0) { this.ccw = true; }
	else if (x === 0) { this.ccw = p2.xori > p1.xori; }
	// Adjacency
	var pt = this.points[0];
	for (var j = 0; j < this.points.length - 1; j++) if (this.points[j].on) {
			setHidden(this.points[j], "prev", pt);
			pt = this.points[j];
	}
	setHidden(this.points[0], "prev", pt);
};
var inPoly = function (point, vs) {
	// ray-casting algorithm based on
	// http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

	var x = point.xori, y = point.yori;

	var inside = 0;
	for (var i = 0, j = vs.length - 2; i < vs.length - 1; j = i++) {
		var xi = vs[i].xori, yi = vs[i].yori;
		var xj = vs[j].xori, yj = vs[j].yori;

		var intersect = ((yi > y) !== (yj > y))
		&& (yj > yi ?
			(x - xi) * (yj - yi) < (xj - xi) * (y - yi) :
			(x - xi) * (yj - yi) > (xj - xi) * (y - yi));
		if (intersect) {
			if (yi > yj) inside += 1;
			else inside -= 1;
		}
	}

	return !!inside;
};
Contour.prototype.includesPoint = function (z) {
	return inPoly(z, this.points);
};
Contour.prototype.includes = function (that) {
	for (var j = 0; j < that.points.length - 1; j++) {
		if (!inPoly(that.points[j], this.points)) return false;
	}
	return true;
};
function Glyph (contours) {
	this.contours = contours || [];
	this.stems = [];
}
Glyph.prototype.containsPoint = function (x, y) {
	var nCW = 0, nCCW = 0;
	for (var j = 0; j < this.contours.length; j++) {
		if (inPoly({ xori: x, yori: y }, this.contours[j].points)) {
			if (this.contours[j].ccw) nCCW += 1;
			else nCW += 1;
		}
	}
	return nCCW != nCW;
};

exports.Glyph = Glyph;
exports.Contour = Contour;
exports.Point = Point;


// /
function slopeOf (segs) {
	var sy = 0, sx = 0, n = 0;
	for (var j = 0; j < segs.length; j++) for (var k = 0; k < segs[j].length; k++) {
			sy += segs[j][k].yori;
			sx += segs[j][k].xori;
			n += 1;
	}
	var ax = sx / n, ay = sy / n;
	var b1num = 0, b1den = 0;
	for (var j = 0; j < segs.length; j++) for (var k = 0; k < segs[j].length; k++) {
			b1num += (segs[j][k].xori - ax) * (segs[j][k].yori - ay);
			b1den += (segs[j][k].xori - ax) * (segs[j][k].xori - ax);
	}
	return b1num / b1den;
}
exports.slopeOf = slopeOf;
