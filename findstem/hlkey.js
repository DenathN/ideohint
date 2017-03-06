"use strict";

function keyptPriority(incoming, current, atl, atr) {
	if (atr) {
		return current.x < incoming.x
	} else if (atl) {
		return current.x > incoming.x
	} else {
		if (current.y === incoming.y) {
			return current.x > incoming.x
		} else {
			return current.y > incoming.y
		}
	}
}

function findHighLowKeys(s, strategy) {
	var highkey = null, lowkey = null, highnonkey = [], lownonkey = [];
	var jHigh = 0, jLow = 0, kHigh = 0, kLow = 0;
	for (var j = 0; j < s.high.length; j++) {
		for (var k = 0; k < s.high[j].length; k++) {
			if (!highkey || s.high[j][k].id >= 0 && keyptPriority(s.high[j][k], highkey, s.atLeft, s.atRight)) {
				highkey = s.high[j][k];
				jHigh = j;
				kHigh = k;
			}
		}
	}
	for (var j = 0; j < s.low.length; j++) {
		for (var k = 0; k < s.low[j].length; k++) {
			if (!lowkey || s.low[j][k].id >= 0 && keyptPriority(s.low[j][k], lowkey, s.atLeft, s.atRight)) {
				lowkey = s.low[j][k];
				jLow = j;
				kLow = k;
			}
		}
	}
	return { highkey, lowkey }
}

function correctYW(ss, strategy) {
	ss.forEach(s => {
		let { highkey, lowkey } = findHighLowKeys(s, strategy);
		s.y = highkey.y;
		s.width = highkey.y - lowkey.y;
	});
	return ss;
}

exports.findHighLowKeys = findHighLowKeys;
exports.correctYW = correctYW;