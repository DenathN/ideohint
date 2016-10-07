"use strict";

function toF26D6 (x) {
	return Math.round(x * 64) / 64;
}
function rtg (x, upm, ppem) {
	if (x >= 0) return Math.round(toF26D6(x / upm * ppem)) / ppem * upm;
	else return -Math.round(toF26D6(-x / upm * ppem)) / ppem * upm;
}
function rtg1 (x, upm, ppem) {
	if (x >= 0) return Math.max(1, Math.round(toF26D6(x / upm * ppem))) / ppem * upm;
	else return -Math.max(1, Math.round(toF26D6(-x / upm * ppem))) / ppem * upm;
}
function rtg_raw (y, upm, ppem) { return Math.round(y / upm * ppem) / ppem * upm; }

function Rtg (upm, ppem) {
	var uppx = upm / ppem;
	return function (x) {
		if (x >= 0) return Math.round(toF26D6(x / uppx)) * uppx;
		else return -Math.round(toF26D6(-x / uppx)) * uppx;
	};
}
function rutg (x, upm, ppem) {
	if (x >= 0) return Math.ceil(toF26D6(x / upm * ppem)) / ppem * upm;
	else return -Math.ceil(toF26D6(-x / upm * ppem)) / ppem * upm;
}
function Rutg (upm, ppem) {
	var uppx = upm / ppem;
	return function (x) {
		if (x >= 0) return Math.ceil(toF26D6(x / uppx)) * uppx;
		else return -Math.ceil(toF26D6(-x / uppx)) * uppx;
	};
}
function rdtg (x, upm, ppem) {
	if (x >= 0) return Math.floor(toF26D6(x / upm * ppem)) / ppem * upm;
	else return -Math.floor(toF26D6(-x / upm * ppem)) / ppem * upm;
}
function Rdtg (upm, ppem) {
	var uppx = upm / ppem;
	return function (x) {
		if (x >= 0) return Math.floor(toF26D6(x / uppx)) * uppx;
		else return -Math.floor(toF26D6(-x / uppx)) * uppx;
	};
}
exports.rtg = rtg;
exports.rtg1 = rtg1;
exports.rutg = rutg;
exports.rdtg = rdtg;
exports.rtg_raw = rtg_raw;
exports.Rtg = Rtg;
exports.Rutg = Rutg;
exports.Rdtg = Rdtg;
