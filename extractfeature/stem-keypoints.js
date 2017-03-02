"use strict";

var slopeOf = require("../types").slopeOf;

function keyptPriority(incoming, current, atr) {
	if (atr) {
		return current.xori < incoming.xori
	} else {
		return current.xori > incoming.xori
	}
}

function atRadicalBottom(s, strategy) {
	return !s.hasSameRadicalStemBelow
		&& !(s.hasRadicalPointBelow && s.radicalCenterDescent > strategy.STEM_CENTER_MIN_DESCENT)
		&& !(s.hasRadicalLeftAdjacentPointBelow && s.radicalLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
		&& !(s.hasRadicalRightAdjacentPointBelow && s.radicalRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
}

function hasGreaterUpperPromixity(stems, js, dov, P) {
	var promUp = 0;
	var promDown = 0;
	for (let j = 0; j < stems.length; j++) {
		if (dov[j][js]) promUp += P[j][js];
		if (dov[js][j]) promDown += P[js][j];
	}
	return promUp > promDown && promDown > 0
}

module.exports = function (glyph, strategy, dov, P) {
	// Stem Keypoints
	for (var js = 0; js < glyph.stems.length; js++) {
		var s = glyph.stems[js];
		// b : a bottom stem?
		var slope = (slopeOf(s.high) + slopeOf(s.low)) / 2;
		var b = atRadicalBottom(s, strategy) && (!s.hasGlyphStemBelow || Math.abs(slope) >= strategy.SLOPE_FUZZ / 2)
			|| hasGreaterUpperPromixity(glyph.stems, js, dov, P)
		// get highkey and lowkey
		var highkey = null, lowkey = null, highnonkey = [], lownonkey = [];
		var jHigh = 0, jLow = 0, kHigh = 0, kLow = 0;
		for (var j = 0; j < s.high.length; j++) {
			for (var k = 0; k < s.high[j].length; k++) {
				if (!highkey || s.high[j][k].id >= 0 && keyptPriority(s.high[j][k], highkey, s.atRight)) {
					highkey = s.high[j][k];
					jHigh = j;
					kHigh = k;
				}
			}
		}
		for (var j = 0; j < s.low.length; j++) {
			for (var k = 0; k < s.low[j].length; k++) {
				if (!lowkey || s.low[j][k].id >= 0 && keyptPriority(s.low[j][k], lowkey, s.atRight)) {
					lowkey = s.low[j][k];
					jLow = j;
					kLow = k;
				}
			}
		}
		highkey.touched = lowkey.touched = true;
		for (var j = 0; j < s.high.length; j++) {
			for (var k = 0; k < s.high[j].length; k++) {
				if (s.high[j][k] === highkey) continue;
				if (j !== jHigh) {
					if (k === 0) {
						highnonkey.push(s.high[j][k]);
						s.high[j][k].touched = true;
					} else {
						s.high[j][k].donttouch = true;
					}
				} else if (s.high[j][k] !== highkey) {
					s.high[j][k].donttouch = true;
				}
				s.high[j][k].linkedKey = highkey;
			}
		}
		for (var j = 0; j < s.low.length; j++) {
			for (var k = 0; k < s.low[j].length; k++) {
				if (s.low[j][k] === lowkey) continue;
				if (j !== jLow) {
					if (k === s.low[j].length - 1) {
						lownonkey.push(s.low[j][k]);
						s.low[j][k].touched = true;
					} else {
						s.low[j][k].donttouch = true;
					}
				} else if (s.low[j][k] !== lowkey) {
					s.low[j][k].donttouch = true;
				}
				s.low[j][k].linkedKey = lowkey;
			}
		}
		if (s.linkedIPsHigh) {
			for (let z of s.linkedIPsHigh.unrel) z.donttouch = true;
		}
		if (s.linkedIPsLow) {
			for (let z of s.linkedIPsLow.unrel) z.donttouch = true;
		}
		s.slope = slope;
		s.yori = highkey.yori;
		s.width = highkey.yori - lowkey.yori;
		s.highkey = highkey;
		s.lowkey = lowkey;
		s.posKey = b ? lowkey : highkey;
		s.advKey = b ? highkey : lowkey;
		s.posAlign = b ? lownonkey : highnonkey;
		s.advAlign = b ? highnonkey : lownonkey;
		s.posKeyAtTop = !b;
		s.posKey.keypoint = true;
		s.advKey.keypoint = true;
		s.posKey.slope = s.advKey.slope = s.slope;
	}
};
