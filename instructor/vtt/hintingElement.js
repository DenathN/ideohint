"use strict";

const KEY_ITEM_STEM = 1;
const KEY_ITEM_BOTTOM = 2;
const KEY_ITEM_TOP = 3;

class HintingElement {
	constructor() {
		this.told = false;
		this.hintedPositions = null;
	}
	untell() {
		this.told = false;
	}
	talk() {
		return ``;
	}
}
class BottomAnchorHintingElement extends HintingElement {
	constructor(id, y, _) {
		super();
		this.ipz = id;
		this.pOrg = y;
		Object.assign(this, _);
	}
	get kind() {
		return KEY_ITEM_BOTTOM;
	}
	talk() {
		return `
/* !!IDH!! Bottom Anchor Kind Direct */
YAnchor(${this.ipz},${this.cvtID})
${this.deltas || ""}
`;
	}
}
class TopAnchorHintingElement extends HintingElement {
	constructor(id, y, _) {
		super();
		this.ipz = id;
		this.pOrg = y;
		Object.assign(this, _);
	}
	get kind() {
		return KEY_ITEM_TOP;
	}
	talk($, bottomAnchor) {
		const isValidLink =
			bottomAnchor &&
			Math.abs(this.pOrg - bottomAnchor.pOrg - this.topBotRefDist) < $.cvtCutin / 2;
		if (isValidLink) {
			return `
/* !!IDH!! Top Anchor Kind Linked */
YLink(${bottomAnchor.ipz},${this.ipz},${this.cvtTopBotDistId})
`;
		} else {
			return `
/* !!IDH!! Top Anchor Kind Direct */
YAnchor(${this.ipz},${this.cvtID})
${this.deltas || ""}
`;
		}
	}
}
class StemHintingElement extends HintingElement {
	constructor(id, y, _) {
		super();
		this.ipz = id;
		this.pOrg = y;
		Object.assign(this, _);
	}
	get kind() {
		return KEY_ITEM_STEM;
	}
}
exports.Bottom = BottomAnchorHintingElement;
exports.Top = TopAnchorHintingElement;
exports.Stem = StemHintingElement;

exports.KEY_ITEM_BOTTOM = KEY_ITEM_BOTTOM;
exports.KEY_ITEM_TOP = KEY_ITEM_TOP;
exports.KEY_ITEM_STEM = KEY_ITEM_STEM;
