"use strict";
const { fpgmShiftOf, LSH_DECLASH_FRACTION } = require("./vttenv");
const HE = require("./hintingElement");

function findClash($$, ej, ek) {
	const rangeMin = $$.pmax + 1;
	const rangeMax = $$.pmaxC;
	if (ej.hintedPositions.length < rangeMax) {
		return true;
	}
	if (ek.hintedPositions.length < rangeMax) {
		return true;
	}
	const sj = ej.stem;
	const sk = ek.stem;
	const wj = Math.abs(sj.posKey.y - sj.advKey.y);
	const wk = Math.abs(sk.posKey.y - sk.advKey.y);
	for (let ppem = rangeMin; ppem < rangeMax; ppem++) {
		const dist = $$.upm / ppem * LSH_DECLASH_FRACTION / 64;
		if (sk.posKeyAtTop && !sj.posKeyAtTop) {
			if (ek.hintedPositions[ppem] - wk - (ej.hintedPositions[ppem] + wj) < dist) return true;
		} else if (sk.posKeyAtTop && sj.posKeyAtTop) {
			if (ek.hintedPositions[ppem] - wk - ej.hintedPositions[ppem] < dist) return true;
		} else if (!sk.posKeyAtTop && !sj.posKeyAtTop) {
			if (ek.hintedPositions[ppem] - (ej.hintedPositions[ppem] + wj) < dist) return true;
		}
	}
	return false;
}

module.exports = function($$, elements) {
	const si = $$.si;
	if (!$$.fpgmPadding || !si.directOverlaps) return;
	const fid = $$.fpgmPadding + fpgmShiftOf.quadstroke_f;
	for (let j = 0; j < elements.length; j++) {
		if (!(elements[j] instanceof HE.Stem)) continue;
		for (let k = elements.length - 1; k > j; k--) {
			if (!(elements[k] instanceof HE.Stem)) continue;
			if (
				!si.directOverlaps[elements[j].sid][elements[k].sid] &&
				!si.directOverlaps[elements[k].sid][elements[j].sid]
			) {
				continue;
			}
			const sj = elements[j].stem;
			const sk = elements[k].stem;

			if (!findClash($$, elements[j], elements[k])) continue;
			if (sk.posKeyAtTop && !sj.posKeyAtTop) {
				$$.talk(
					`Call(${sk.advKey.id},${sj.advKey.id},${sk.posKey.id},${sj.posKey.id},${
						$$.pmax
					},${fid})`
				);
			} else if (sk.posKeyAtTop && sj.posKeyAtTop) {
				$$.talk(
					`Call(${sk.advKey.id},${sj.posKey.id},${sk.posKey.id},${sj.posKey.id},${
						$$.pmax
					},${fid})`
				);
			} else if (!sk.posKeyAtTop && !sj.posKeyAtTop) {
				$$.talk(
					`Call(${sk.posKey.id},${sj.advKey.id},${sk.posKey.id},${sj.posKey.id},${
						$$.pmax
					},${fid})`
				);
			}
		}
	}
};
