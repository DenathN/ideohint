const roundings = require("../roundings");

const ROUNDING_CUTOFF = 1 / 2 - 1 / 32;
const STRICT_CUTOFF = 1 / 4;
const HALF_PIXEL_PPEM = 18;

function decideDelta(gear, original, target, upm, ppem) {
	return Math.round(gear * (target - original) / (upm / ppem));
}

function decideDeltaShift(gear, sign, isStrict, isStacked, base0, dist0, base1, dist1, upm, ppem) {
	var y1 = base0 + sign * dist0;
	var y2 = base1 + sign * dist1;
	var yDesired = isStacked ? base1 : base1 + sign * dist0;
	var deltaStart = Math.round(gear * (y2 - y1) / (upm / ppem));
	var deltaDesired = Math.round(gear * (yDesired - y1) / (upm / ppem));
	var delta = deltaStart - deltaDesired;
	// We will try to reduce delta to 0 when there is "enough space".
	while (/* !(dist0 < dist1 && dist1 <= (1 + 1 / 16) * (upm / ppem) && !isStacked) && */ delta) {
		const delta1 = (delta > 0 ? delta - 1 : delta + 1);
		const y2a = y1 + (deltaDesired + delta1) * (upm / ppem) / gear;
		if (roundings.rtg(y2 - base1, upm, ppem) !== roundings.rtg(y2a - base1, upm, ppem) // wrong pixel!
			|| Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > ROUNDING_CUTOFF * (upm / ppem)
			|| isStrict && !isStacked && (sign > 0 || Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > STRICT_CUTOFF * (upm / ppem))) break;
		delta = (delta > 0 ? delta - 1 : delta + 1);
	}
	// process.stderr.write(`${delta0} -> ${delta} @ ${ppem}` + "\n");
	return delta + deltaDesired
}

exports.decideDelta = decideDelta;
exports.decideDeltaShift = decideDeltaShift;