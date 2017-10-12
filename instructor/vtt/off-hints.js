"use strict";

function queryExtrema(contours) {
	let n = 0;
	let ans = [];
	for (let c of contours) {
		let ctrTopID = -1,
			ctrTop = null;
		let ctrBottomID = -1,
			ctrBottom = null;
		for (let z of c) {
			if (!ctrTop || z.y > ctrTop.y) {
				ctrTopID = n;
				ctrTop = z;
			}
			if (!ctrBottom || z.y < ctrBottom.y) {
				ctrBottomID = n;
				ctrBottom = z;
			}
			n++;
		}
		if (ctrTop) ans.push({ id: ctrTopID, x: ctrTop.x, y: ctrTop.y });
		if (ctrBottom) ans.push({ id: ctrBottomID, x: ctrBottom.x, y: ctrBottom.y });
	}
	return ans;
}
module.exports = function formOffhints(contours, elements) {
	if (!contours) return;
	const extrema = queryExtrema(contours).sort((a, b) => a.y - b.y);
	if (elements.length) {
		let topZs = [],
			bottomZs = [];
		const topC = elements[elements.length - 1];
		const bottomC = elements[0];
		for (let z of extrema) {
			if (z.y > topC.pOrg) {
				topZs.push(z);
			} else if (z.y < bottomC.pOrg) {
				bottomZs.push(z);
			}
		}

		topZs = topZs.sort((a, b) => b.y - a.y);
		bottomZs = bottomZs.sort((a, b) => a.y - b.y);
		if (topZs.length) {
			if (topZs[0].y - topC.pOrg < this.upm / 3) {
				this.talk(`YDist(${topC.ipz},${topZs[0].id})`);
			} else {
				this.talk(`YAnchor(${topZs[0].id})`);
			}
			if (topZs.length > 1)
				this.talk(
					`YInterpolate(${topC.ipz},${topZs
						.slice(1)
						.map(z => z.id)
						.join(",")},${topZs[0].id})`
				);
		}
		if (bottomZs.length) {
			if (bottomC.pOrg - bottomZs[0].y < this.upm / 3) {
				this.talk(`YDist(${bottomC.ipz},${bottomZs[0].id})`);
			} else {
				this.talk(`YAnchor(${bottomZs[0].id})`);
			}
			if (bottomZs.length > 1)
				this.talk(
					`YInterpolate(${bottomC.ipz},${bottomZs
						.slice(1)
						.map(z => z.id)
						.join(",")},${bottomZs[0].id})`
				);
		}
	} else if (extrema.length >= 2) {
		this.talk(`YAnchor(${extrema[0].id})`);
		this.talk(`YDist(${extrema[0].id},${extrema[extrema.length - 1].id})`);
		if (extrema.length > 2) {
			this.talk(
				`YInterpolate(${extrema[0].id},${extrema
					.slice(1, -1)
					.map(z => z.id)
					.join(",")},${extrema[extrema.length - 1].id})`
			);
		}
	}
};
