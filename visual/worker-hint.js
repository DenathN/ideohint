/* eslint-env worker */
"use strict";

const core = require("../core");
const postprocess = require("../core/postprocess");
const roundings = require("../support/roundings");

onmessage = function(message) {
	const { input, strategy } = message.data;
	const glyphs = input.map(function(passage) {
		if (passage) {
			const glyph = core.parseOTD(passage);
			return {
				glyph: glyph,
				features: core.extractFeature(glyph, strategy),
				hints: []
			};
		}
	});

	for (let g of glyphs) {
		g.hints = core.decideHints(g.features, strategy).sd;
		for (let ppem = 0; ppem < g.hints.length; ppem++) {
			if (!g.hints[ppem]) continue;
			postprocess.for(
				g.hints[ppem].y,
				g.features.stems,
				g.features.overlaps,
				strategy.UPM / ppem,
				[
					Math.round(
						roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, strategy.UPM, ppem) /
							(strategy.UPM / ppem)
					)
				]
			);
		}
	}
	postMessage(glyphs);
};
