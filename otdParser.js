"use strict"

var Contour = require('./types').Contour;
var Point = require('./types').Point;
var Glyph = require('./types').Glyph;
var util = require('util');

var crypto = require('crypto');
function getSHA1(text) {
	return crypto.createHash('sha1').update(text).digest('hex');
}
function hashContours(input) {
	var buf = '';
	for (var j = 0; j < input.length; j++) {
		buf += 'a';
		var c = input[j];
		for (var k = 0; k < c.length; k++) {
			if (c[k].on) { buf += 'l' } else { buf += 'c' };
			buf += c[k].x + ' ' + c[k].y;
		}
	}
	return getSHA1(buf);
}

function parseOTD(input) {
	var contours = [], indexedPoints = [];
	var ptindex = 0;
	for (var j = 0; j < input.length; j++) {
		var c = input[j];
		if (c.length < 1) continue;
		var currentContour = new Contour();
		var c0index = ptindex;
		for (var k = 0; k < c.length; k++) {
			var pt = new Point(c[k].x, c[k].y, c[k].on, ptindex);
			currentContour.points.push(pt);
			indexedPoints[ptindex] = pt;
			ptindex++;
		}
		var pt = new Point(c[0].x, c[0].y, c[0].on, c0index);
		currentContour.points.push(pt);
		indexedPoints[c0index] = pt;
		contours.push(currentContour);
	}
	var glyph = new Glyph(contours);
	glyph.unifyZ();
	glyph.stat();
	glyph.nPoints = ptindex - 1;
	glyph.indexedPoints = indexedPoints;
	return glyph;
}

exports.parseOTD = parseOTD;
exports.hashContours = hashContours;
