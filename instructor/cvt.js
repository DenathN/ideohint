"use strict";

var fs = require("fs");
var roundings = require("../support/roundings");
const { mix } = require("../support/common");
const toVQ = require("../support/vq");

function pushWhenAbsent(a, x) {
	a.push(x);
}

function createCvt(src, strategy, padding) {
	var MAX_SW = 5;
	var cvt = (src || []).slice(0);
	padding = padding || 0;
	if (padding) cvt = cvt.slice(0, padding);
	while (cvt.length < padding) cvt.push(0);
	pushWhenAbsent(cvt, 0); // padding + 0
	pushWhenAbsent(cvt, strategy.BLUEZONE_TOP_CENTER);
	pushWhenAbsent(cvt, strategy.BLUEZONE_BOTTOM_CENTER);
	pushWhenAbsent(cvt, 0); // padding + 3
	for (var ppem = 1; ppem <= strategy.PPEM_MAX; ppem++) {
		var rtg = roundings.Rtg(strategy.UPM, ppem);
		var vtop = Math.round(
			rtg(strategy.BLUEZONE_BOTTOM_CENTER) +
				rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER)
		);
		pushWhenAbsent(cvt, vtop);
	}
	for (var w = 1; w <= MAX_SW; w++) {
		for (var ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
			pushWhenAbsent(cvt, -Math.round(strategy.UPM / ppem * w));
		}
	}
	for (var w = 1; w <= MAX_SW; w++) {
		for (var ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
			pushWhenAbsent(cvt, Math.round(strategy.UPM / ppem * w));
		}
	}
	return cvt;
}

exports.getPadding = function(argv, parameterFile) {
	if (parameterFile && parameterFile.cvt) {
		return parameterFile.cvt.padding - 0 || 0;
	} else if (argv.CVT_PADDING) {
		return argv.CVT_PADDING - 0 || 0;
	} else {
		return 0;
	}
};
exports.createCvt = createCvt;
exports.getVTTAux = function(strategy) {
	const bot = strategy.BLUEZONE_BOTTOM_CENTER;
	const top = strategy.BLUEZONE_TOP_CENTER;
	const canonicalSW = toVQ(strategy.CANONICAL_STEM_WIDTH, strategy.PPEM_MAX);
	const canonicalSWD = toVQ(strategy.CANONICAL_STEM_WIDTH_DENSE, strategy.PPEM_MAX);
	const p = 1 / 20;
	const pd = 1 / 40;
	return {
		yBotBar: Math.round(mix(bot, top, p)),
		yBotD: Math.round(mix(bot, top, pd)),
		yTopBar: Math.round(mix(top, bot, p)),
		yTopD: Math.round(mix(top, bot, pd)),
		canonicalSW: Math.round(canonicalSW),
		canonicalSWD: Math.round(canonicalSWD),
		canonicalSWD1: Math.round(canonicalSWD * 1 / 6),
		canonicalSWD2: Math.round(canonicalSWD * 2 / 6),
		canonicalSWD3: Math.round(canonicalSWD * 3 / 6),
		canonicalSWD4: Math.round(canonicalSWD * 4 / 6),
		canonicalSWD5: Math.round(canonicalSWD * 5 / 6)
	};
};
