"use strict"

function adjacent(z1, z2) { return z1.prev === z2 || z2.prev === z1 }
function near(z1, z2, d) {
	return Math.hypot(z1.xori - z2.xori, z1.yori - z2.yori) < d;
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
				if ((zm.touched || zm.donttouch) && adjacent(point, zm) && zm.yori < point.yori && near(point, zm, strategy.STEM_SIDE_MIN_RISE)) {
					isDecoTop = true;
				}
			}
			if (!isDecoTop && point.ytouch >= strategy.BLUEZONE_TOP_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				topBluePoints.push(point.id);
			}
			if (point.ytouch <= strategy.BLUEZONE_BOTTOM_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				bottomBluePoints.push(point.id);
			}
		}
	}
	return {
		top: topBluePoints,
		bottom: bottomBluePoints
	}
}
