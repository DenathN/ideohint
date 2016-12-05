"use strict";

function stemPositionToActions(stems, uppx, env) {
	let actions = [];
	for (let j = 0; j < stems.length; j++) {
		let stem = stems[j], w = stem.touchwidth;
		let strict = false;
		let stacked = false;
		for (let k = 0; k < j; k++) {
			if (!env.directOverlaps[j][k])continue;
			if (stems[j].ytouch - w - stems[k].ytouch <= 0.1 * uppx
				&& stems[j].touchwidth > stems[j].width
				&& stems[j].posKeyAtTop && stems[k].posKeyAtTop
				&& stems[j].xmax - stems[j].xmin < stems[k].xmax - stems[k].xmin) {
				stacked = true;
			}
			if (stems[j].width < stems[j].touchwidth) continue;
			if (stems[j].ytouch - w - stems[k].ytouch <= 1.05 * uppx && stems[j].posKeyAtTop) {
				strict = true;
			}
		}
		for (let k = j + 1; k < stems.length; k++) {
			if (!env.directOverlaps[k][j])continue;
			if (stems[k].ytouch - stems[k].touchwidth - stems[j].ytouch <= 0.1 * uppx
				&& stems[j].touchwidth > stems[j].width
				&& stems[j].posKeyAtTop && stems[k].posKeyAtTop
				&& stems[j].xmax - stems[j].xmin < stems[k].xmax - stems[k].xmin) {
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
