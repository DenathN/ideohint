"use strict"

module.exports = function (glyph, strategy) {
	// Blue zone points
	var topBluePoints = [];
	var bottomBluePoints = [];
	for (var j = 0; j < glyph.contours.length; j++) {
		for (var k = 0; k < glyph.contours[j].points.length - 1; k++) {
			var point = glyph.contours[j].points[k];
			if (point.ytouch >= strategy.BLUEZONE_TOP_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
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
