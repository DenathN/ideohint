"use strict";

const analyzeStemKeyPoints = require("./stem-keypoints");
const analyzeInterpolations = require("./absorptions-interpolations");
const analyzeBlueZonePoints = require("./bluezone");

const { analyzeDirectOverlaps, transitionClosure } = require("../si-common/overlap");
const { analyzeTriplets, analyzeQuartlets } = require("./triplet");
const analyzeBlanks = require("./triplet").analyzeBlanks;
const getStemKeyInfo = require("./stem-keyinfo");
const analyzeXInterpolate = require("./xinterpolate");
const analyzeSpur = require("./analyze-spur");

function byyori(a, b) {
	return a.y - b.y;
}

exports.extractFeature = function(glyph, strategy) {
	const directOverlaps = analyzeDirectOverlaps(glyph, strategy, true);
	const strictOverlaps = analyzeDirectOverlaps(glyph, strategy, false);
	analyzeStemKeyPoints(
		glyph.stems,
		strategy,
		directOverlaps,
		glyph.collisionMatrices.promixity,
		glyph.collisionMatrices.flips
	);
	const blueZonePoints = analyzeBlueZonePoints(glyph, strategy);
	analyzeSpur(blueZonePoints, glyph.stems);
	const iss = analyzeInterpolations(glyph, blueZonePoints, strategy);
	const overlaps = transitionClosure(directOverlaps);
	const blanks = analyzeBlanks(glyph.stems, directOverlaps);
	const strictBlanks = analyzeBlanks(glyph.stems, strictOverlaps);
	const triplets = analyzeTriplets(glyph.stems, directOverlaps, blanks);
	const quartlets = analyzeQuartlets(triplets, directOverlaps, blanks);
	const strictTriplets = analyzeTriplets(glyph.stems, strictOverlaps, strictBlanks);
	const xIP = analyzeXInterpolate(glyph);

	return {
		stats: Object.assign(glyph.stats, { nRadicals: glyph.radicals.length }),
		stems: glyph.stems.map(getStemKeyInfo).sort(byyori),
		stemOverlaps: glyph.stemOverlaps,
		stemOverlapLengths: glyph.stemOverlapLengths,
		directOverlaps: directOverlaps,
		strictOverlaps: strictOverlaps,
		overlaps: overlaps,
		triplets,
		quartlets,
		strictTriplets: strictTriplets,
		collisionMatrices: glyph.collisionMatrices,
		blueZoned: blueZonePoints,
		interpolations: iss.interpolations,
		shortAbsorptions: iss.shortAbsorptions,
		diagAligns: iss.diagAligns,
		xIP: xIP
	};
};
