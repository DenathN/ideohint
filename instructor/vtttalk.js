var roundings = require("../roundings");

const decideDelta = require('./delta.js').decideDelta;
const decideDeltaShift = require('./delta.js').decideDeltaShift;

const ROUNDING_SEGMENTS = 16;

function formatdelta(delta) {
	let u = Math.round(delta * ROUNDING_SEGMENTS);
	let d = ROUNDING_SEGMENTS;
	while (!(u % 2) && !(d % 2) && d > 1) { u /= 2, d /= 2; }
	if (d > 1) {
		return u + "/" + d;
	} else {
		return "" + u;
	}
}
function sanityDelta(z, d) {
	var deltas = d.filter((x) => x.delta);
	if (!deltas.length) return "";
	let buf = [];
	let ppemstart = 0, ppemend = 0;
	let curdelta = 0;
	for (let x of deltas) {
		if (x.ppem === ppemend + 1 && x.delta === curdelta) {
			ppemend += 1;
		} else {
			if (curdelta) buf.push(formatdelta(curdelta) + "@" + (ppemend > ppemstart ? ppemstart + ".." + ppemend : ppemstart));
			ppemstart = ppemend = x.ppem;
			curdelta = x.delta;
		}
	}
	if (curdelta) buf.push(formatdelta(curdelta) + "@" + (ppemend > ppemstart ? ppemstart + ".." + ppemend : ppemstart));
	return `YDelta(${z},${buf.join(',')})`;
}

// si : size-inpendent actions
// sd : size-dependent actions
// strategy : strategy object
// padding : CVT padding value, padding + 1 -> bottom anchor; padding + 2 -> top anchor
function produceVTTTalk(record, strategy, padding, isXML) {
	const sd = record.sd;
	const si = record.si;
	const pmin = record.pmin;
	const pmax = record.pmax;
	const upm = strategy.UPM;
	let buf = "";
	function talk(s) { buf += s + "\n"; }
	// bottom
	for (let j = 0; j < si.bottomBluePoints.length; j++) {
		const z = si.bottomBluePoints[j];
		talk(`YAnchor(${z},${padding + 2})`);
	}
	// top
	for (let j = 0; j < si.topBluePoints.length; j++) {
		const z = si.topBluePoints[j];
		if (j === 0) {
			talk(`YAnchor(${z},${padding + 1})`);
			let deltas = [];
			for (let ppem = pmin; ppem <= pmax; ppem++) {
				let source = roundings.rtg(strategy.BLUEZONE_TOP_CENTER, upm, ppem);
				let vtop = roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
					+ roundings.rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem);
				deltas.push({
					ppem,
					delta: decideDelta(ROUNDING_SEGMENTS, source, vtop, upm, ppem) / ROUNDING_SEGMENTS
				})
			}
			talk(sanityDelta(z, deltas));
		} else {
			talk(`YLink(${si.topBluePoints[0]}, ${z}, ${padding}, ${isXML ? '&lt;' : '<'})`)
		}
	}
	for (var sid = 0; sid < si.stems.length; sid++) {
		let s = si.stems[sid];

		let deltaPos = [];
		let deltaADv = [];

		for (let ppem = pmin; ppem <= pmax; ppem++) {
			if (!sd[ppem]) continue;
			const [ytouch, wtouch, isStrict, isStacked] = sd[ppem][sid];
			if (s.posKeyAtTop) {
				const psrc = roundings.rtg(s.y0, upm, ppem);
				const pdst = ytouch * (upm / ppem);
				const posdelta = {
					ppem,
					delta: decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS
				};
				deltaPos.push(posdelta);
				const wsrc = s.w0;
				const wdst = wtouch * (upm / ppem);
				deltaADv.push({
					ppem,
					delta: decideDeltaShift(
						ROUNDING_SEGMENTS, -1,
						isStrict, isStacked,
						pdst, wsrc,
						pdst, wdst,
						upm, ppem) / ROUNDING_SEGMENTS
				});
			} else {
				const psrc = roundings.rtg(s.y0 - s.w0, upm, ppem);
				const pdst = (ytouch - wtouch) * (upm / ppem);
				const posdelta = {
					ppem,
					delta: decideDelta(ROUNDING_SEGMENTS, psrc, pdst, upm, ppem) / ROUNDING_SEGMENTS
				};
				deltaPos.push(posdelta);
				const wsrc = s.w0;
				const wdst = wtouch * (upm / ppem);
				deltaADv.push({
					ppem,
					delta: decideDeltaShift(
						ROUNDING_SEGMENTS, 1,
						isStrict, isStacked,
						pdst, wsrc,
						pdst, wdst,
						upm, ppem) / ROUNDING_SEGMENTS
				});
			}
		}

		talk(`YAnchor(${s.posKey})`);
		talk(sanityDelta(s.posKey, deltaPos));
		if (strategy.SIGNIFICANT_LINK_ARROW) {
			talk(`YNoRound(${s.advKey})`);
			talk(`YDist(${s.posKey},${s.advKey})`);
		} else {
			talk(`YShift(${s.posKey},${s.advKey}) /* !IMPORTANT */`);
		}
		talk(sanityDelta(s.advKey, deltaADv));
		let pk = s.posKey;
		for (let zp of s.posAlign) {
			talk(`YShift(${pk},${zp})`);
		}
		pk = s.advKey;
		for (let zp of s.advAlign) {
			talk(`YShift(${s.advKey},${zp})`);
		}
	}
	var l = 0;
	for (let j = 1; j < si.ipsacalls.length; j++) {
		if (si.ipsacalls[l] && si.ipsacalls[j]
			&& si.ipsacalls[l].length > 2
			&& si.ipsacalls[l].length < 16
			&& si.ipsacalls[j].length > 2
			&& si.ipsacalls[l][0] === si.ipsacalls[j][0]
			&& si.ipsacalls[l][1] === si.ipsacalls[j][1]) {
			si.ipsacalls[l].push(si.ipsacalls[j][2]);
			si.ipsacalls[j] = null;
		} else {
			l = j;
		}
	}
	for (let c of si.ipsacalls) {
		if (!c) continue;
		if (c.length >= 3) { // ip
			if (c[0] !== c[1]) talk(`YInterpolate(${c[0]},${c.slice(2).join(',')},${c[1]})`);
		} else {
			talk(`YShift(${c[0]},${c[1]})`);
		}
	}
	talk("Smooth()");
	return buf;
}

exports.talk = produceVTTTalk;