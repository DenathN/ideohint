"use strict"

const { adjacent: adjacent } = require('../types/point');
function near(z1, z2, d) {
	return Math.hypot(z1.x - z2.x, z1.y - z2.y) < d;
}

module.exports = function (glyph, strategy) {
	// Blue zone points
	var topBluePoints = [];
	var bottomBluePoints = [];
	for (var j = 0; j < glyph.contours.length; j++) {
		for (var k = 0; k < glyph.contours[j].points.length - 1; k++) {
			var point = glyph.contours[j].points[k];
			var isDecoTop = false;
			for (var m = 0; m < glyph.contours[j].points.length - 1; m++) {
				var zm = glyph.contours[j].points[m];
				if ((zm.touched || zm.donttouch) && adjacent(point, zm) && zm.y < point.y && near(point, zm, strategy.STEM_SIDE_MIN_RISE)) {
					isDecoTop = true;
				}
			}
			if (!isDecoTop && point.ytouch >= strategy.BLUEZONE_TOP_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				topBluePoints.push(point);
			}
			if (point.ytouch <= strategy.BLUEZONE_BOTTOM_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				bottomBluePoints.push(point);
			}
		}
	}
	return {
		top: topBluePoints.sort((a, b) => b.y - a.y).map(p => p.id),
		bottom: bottomBluePoints.sort((a, b) => a.y - b.y).map(p => p.id),
		topZs: topBluePoints.sort((a, b) => b.y - a.y).map(p => ({ id: p.id, y: p.y })),
		bottomZs: bottomBluePoints.sort((a, b) => b.y - a.y).map(p => ({ id: p.id, y: p.y })),
	}
}
