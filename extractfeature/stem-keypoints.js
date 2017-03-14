"use strict";

const slopeOf = require("../types").slopeOf;
const hlkey = require('../findstem/hlkey');

function keyptPriority(incoming, current, atr) {
	if (atr) {
		return current.x < incoming.x
	} else {
		return current.x > incoming.x
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
	return promUp >= promDown && promDown > 0
}

module.exports = function (glyph, strategy, dov, P) {
	// Stem Keypoints
	for (var js = 0; js < glyph.stems.length; js++) {
		const s = glyph.stems[js];
		// posKeyShouldAtBottom : a bottom stem?
		const slope = (slopeOf(s.high) + slopeOf(s.low)) / 2;
		const posKeyShouldAtBottom = atRadicalBottom(s, strategy) && s.hasGlyphStemAbove
			|| hasGreaterUpperPromixity(glyph.stems, js, dov, P);

		// get highkey and lowkey
		const { highkey, lowkey } = hlkey.findHighLowKeys(s, strategy);
		highkey.touched = lowkey.touched = true;

		// get non-key points
		let highnonkey = [], lownonkey = [];
		for (var j = 0; j < s.high.length; j++) {
			for (var k = 0; k < s.high[j].length; k++) {
				if (s.high[j][k] === highkey) continue;
				if (!(s.high[j][k].id >= 0)) continue;
				if (k === 0) {
					highnonkey.push(s.high[j][k]);
					s.high[j][k].touched = true;
				} else {
					s.high[j][k].donttouch = true;
				}
				s.high[j][k].linkedKey = highkey;
			}
		}
		for (var j = 0; j < s.low.length; j++) {
			for (var k = 0; k < s.low[j].length; k++) {
				if (s.low[j][k] === lowkey) continue;
				if (!(s.low[j][k].id >= 0)) continue;
				if (k === s.low[j].length - 1) {
					lownonkey.push(s.low[j][k]);
					s.low[j][k].touched = true;
				} else {
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
		s.y = highkey.y;
		s.width = highkey.y - lowkey.y;
		s.highkey = highkey;
		s.lowkey = lowkey;
		s.posKey = posKeyShouldAtBottom ? lowkey : highkey;
		s.advKey = posKeyShouldAtBottom ? highkey : lowkey;
		s.posAlign = posKeyShouldAtBottom ? lownonkey : highnonkey;
		s.advAlign = posKeyShouldAtBottom ? highnonkey : lownonkey;
		s.posKeyAtTop = !posKeyShouldAtBottom;
		s.posKey.keypoint = true;
		s.advKey.keypoint = true;
		s.posKey.slope = s.advKey.slope = s.slope;
	}
};
