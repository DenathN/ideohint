"use strict"

const roundings = require("../roundings");

const ROUNDING_CUTOFF = 1 / 2 - 4 / 64;
const STRICT_CUTOFF = 1 / 4;
const HALF_PIXEL_PPEM = 18;
const MINIMAL_STROKE_WIDTH = 3 / 4;

function decideDelta(gear, original, target, upm, ppem) {
	return Math.round(gear * (target - original) / (upm / ppem));
}

function decideDeltaShift(gear, sign, isStrict, isStacked, base0, dist0, base1, dist1, upm, ppem) {
	var uppx = upm / ppem;
	var y1 = base0 + sign * dist0;
	var y2 = base1 + sign * dist1;
	var yDesired = isStacked ? base1 : base1 + sign * dist0;
	var deltaStart = Math.round(gear * (y2 - y1) / uppx);
	var deltaDesired = Math.round(gear * (yDesired - y1) / uppx);
	var delta = deltaStart - deltaDesired;
	// We will try to reduce delta to 0 when there is "enough space".
	while (delta) {
		const delta1 = (delta > 0 ? delta - 1 : delta + 1);
		const y2a = y1 + (deltaDesired + delta1) * uppx / gear;
		const d = Math.abs(base1 - y2a);
		if (!isStacked && d < MINIMAL_STROKE_WIDTH * uppx) break;
		if (roundings.rtg(y2 - base1, upm, ppem) !== roundings.rtg(y2a - base1, upm, ppem)) break; // wrong pixel!
		if (Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > ROUNDING_CUTOFF * uppx) break;
		if (isStrict && !isStacked &&
			(sign > 0 || Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > STRICT_CUTOFF * uppx)) break;
		delta = (delta > 0 ? delta - 1 : delta + 1);
	}
	return delta + deltaDesired
}

exports.decideDelta = decideDelta;
exports.decideDeltaShift = decideDeltaShift;
