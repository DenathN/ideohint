"use strict";

const analyzeStemKeyPoints = require("./stem-keypoints");
const analyzeInterpolations = require("./absorptions-interpolations");
const analyzeBlueZonePoints = require("./bluezone");
const analyzeDirectOverlaps = require("./overlap").analyzeDirectOverlaps;
const analyzeEdgeTouches = require("./overlap").analyzeEdgeTouches;
const transitionClosure = require("./overlap").transitionClosure;
const analyzeTriplets = require("./triplet").analyzeTriplets;
const analyzeBlanks = require("./triplet").analyzeBlanks;
const analyzeFlex = require("./flex");
const getStemKeyInfo = require("./stem-keyinfo");
const analyzeDominance = require("./dominance");
const analyzeXInterpolate = require("./xinterpolate");

function byyori(a, b) {
	return a.y - b.y;
}

exports.extractFeature = function(glyph, strategy) {
	const directOverlaps = analyzeDirectOverlaps(glyph, strategy, true);
	const strictOverlaps = analyzeDirectOverlaps(glyph, strategy, false);
	analyzeStemKeyPoints(glyph, strategy, directOverlaps, glyph.collisionMatrices.promixity);
	const blueZonePoints = analyzeBlueZonePoints(glyph, strategy);
	const iss = analyzeInterpolations(glyph, strategy);
	const edgeTouches = analyzeEdgeTouches(glyph.stems, glyph.stemOverlaps);
	const overlaps = transitionClosure(directOverlaps);
	const blanks = analyzeBlanks(glyph.stems, directOverlaps);
	const strictBlanks = analyzeBlanks(glyph.stems, strictOverlaps);
	const triplets = analyzeTriplets(glyph.stems, directOverlaps, blanks);
	const strictTriplets = analyzeTriplets(glyph.stems, strictOverlaps, strictBlanks);
	const flexes = analyzeFlex(glyph, blanks);
	const dominancePriority = analyzeDominance(glyph.stems);
	const xIP = analyzeXInterpolate(glyph);
	return {
		stats: Object.assign(glyph.stats, { nRadicals: glyph.radicals.length }),
		stems: glyph.stems.map(getStemKeyInfo).sort(byyori),
		stemOverlaps: glyph.stemOverlaps,
		directOverlaps: directOverlaps,
		strictOverlaps: strictOverlaps,
		edgeTouches: edgeTouches,
		overlaps: overlaps,
		triplets: triplets,
		strictTriplets: strictTriplets,
		flexes: flexes,
		collisionMatrices: glyph.collisionMatrices,
		blueZoned: blueZonePoints,
		interpolations: iss.interpolations,
		shortAbsorptions: iss.shortAbsorptions,
		diagAligns: iss.diagAligns,
		dominancePriority: dominancePriority,
		xIP: xIP
	};
};
