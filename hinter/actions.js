"use strict"

function stemPositionToActions(stems, uppx) {
	var actions = [];
	for (var j = 0; j < stems.length; j++) {
		var stem = stems[j], w = stem.touchwidth;

		var pos = ['ROUND', stem.posKey.id, stem.posKey.yori, Math.round(stem.posKeyAtTop ? stem.ytouch : stem.ytouch - w)];
		var adv = ['ALIGNW', stem.posKey.id, stem.advKey.id, stem.width / uppx, Math.round(w / uppx)]
		actions.push({
			pos: pos,
			adv: adv,
			orient: stem.posKeyAtTop
		})
	};
	return actions;
}
module.exports = stemPositionToActions;