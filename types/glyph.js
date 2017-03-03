"use strict";


function Glyph(contours) {
	this.contours = contours || [];
	this.stems = [];
	this.nPoints = 0;
	this.indexedPoints = [];
}
Glyph.prototype.containsPoint = function (x, y) {
	var nCW = 0, nCCW = 0;
	for (var j = 0; j < this.contours.length; j++) {
		if (inPoly({ x: x, y: y }, this.contours[j].points)) {
			if (this.contours[j].ccw) nCCW += 1;
			else nCW += 1;
		}
	}
	return nCCW != nCW;
};
Glyph.prototype.unifyZ = function () {
	for (var j = 0; j < this.contours.length; j++) {
		var pts = this.contours[j].points
		for (var k = 0; k < pts.length; k++) {
			if (this.indexedPoints[pts[k].id]) {
				pts[k] = this.indexedPoints[pts[k].id]
			}
		}
	}
}


module.exports = Glyph;