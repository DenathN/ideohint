"use strict"

function stemPositionToActions(stems, uppx) {
	var actions = [];
	for (var j = 0; j < stems.length; j++) {
		var stem = stems[j], w = stem.touchwidth;
		actions.push([
			Math.round(stem.ytouch / uppx),
			Math.round(w / uppx)
		]);
	};
	return actions;
}
module.exports = stemPositionToActions;