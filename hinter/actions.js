"use strict";

function stemPositionToActions(stems, uppx, env) {
	let actions = [];
	for (let j = 0; j < stems.length; j++) {
		let stem = stems[j], w = stem.touchwidth;
		let strict = stem.posKeyAtTop
			? (stem.ytouch - w - env.glyphBottom <= 1.05 * uppx)
			: (env.glyphTop - stem.ytouch <= 1.05 * uppx);
		let stacked = false;
		for (let k = 0; k < j; k++) {
			if (!env.directOverlaps[j][k]) continue;
			if (stem.ytouch - w - stems[k].ytouch <= 0.1 * uppx
				&& stem.touchwidth >= stem.width * 0.5
				&& stem.xmax - stem.xmin < stems[k].xmax - stems[k].xmin) {
				stacked = true;
			}
			if (stem.width < stem.touchwidth) continue;
			if (stem.ytouch - w - stems[k].ytouch <= 1.05 * uppx && stem.posKeyAtTop) {
				strict = true;
			}
		}
		for (let k = j + 1; k < stems.length; k++) {
			if (!env.directOverlaps[k][j]) continue;
			if (stems[k].ytouch - stems[k].touchwidth - stem.ytouch <= 0.1 * uppx
				&& stem.touchwidth >= stem.width * 0.5
				&& stem.xmax - stem.xmin < stems[k].xmax - stems[k].xmin) {
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
