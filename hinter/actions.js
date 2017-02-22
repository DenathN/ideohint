"use strict";

function stemPositionToActions(stems, uppx, env) {
	let actions = [];
	for (let j = 0; j < stems.length; j++) {
		let stem = stems[j], w = stem.touchwidth;
		let strict = stem.posKeyAtTop
			? (stem.hasGlyphPointBelow ? stem.ytouch - w - env.glyphBottom <= 1.05 * uppx : false)
			: (stem.hasGlyphPointAbove ? env.glyphTop - stem.ytouch <= 1.05 * uppx : false);
		let stacked = false;
		for (let k = 0; k < j; k++) {
			if (!env.directOverlaps[j][k]) continue;
			if (stem.ytouch - w - stems[k].ytouch <= 0.1 * uppx
				&& stem.touchwidth >= stem.width * 0.5
				&& stem.xmax <= stems[k].xmax + w / 2
				&& stem.xmin >= stems[k].xmin - w / 2) {
				stacked = true;
			}
			if (stem.width < stem.touchwidth) continue;
			if (stem.ytouch - w - stems[k].ytouch <= 1.05 * uppx && stem.posKeyAtTop
				|| stem.ytouch - w - stems[k].ytouch <= 2.05 * uppx && stem.posKeyAtTop && !stems[k].posKeyAtTop
				&& stems[k].touchwidth < stems[k].width - 0.2 * uppx
				&& stem.touchwidth < stem.width - 0.2 * uppx) {
				strict = true;
			}
		}
		for (let k = j + 1; k < stems.length; k++) {
			if (!env.directOverlaps[k][j]) continue;
			if (stems[k].ytouch - stems[k].touchwidth - stem.ytouch <= 0.1 * uppx
				&& stem.touchwidth >= stem.width * 0.5
				&& stem.xmax < stems[k].xmax + w / 2 && stem.xmin > stems[k].xmin - w / 2
				&& !(stem.xmax + w / 2 > stems[k].xmax && stem.xmin - w / 2 < stems[k].xmin)) {
				stacked = true;
			}
		}
		actions.push([
			Math.round(stem.ytouch / uppx),
			Math.round(w / uppx),
			strict,
			stacked
		]);
	}
	return actions;
}
module.exports = stemPositionToActions;
