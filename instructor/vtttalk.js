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
/*
function decideDelta(source, dest, upm, ppem) {
	let delta = Math.round(ROUNDING_SEGMENTS * (dest - source) / (upm / ppem));
	return {
		ppem: ppem,
		delta: delta / ROUNDING_SEGMENTS
	};
}
function decideDeltaShift(base, sign, source, dest, isStrict, isStacked, upm, ppem) {
	// source : original stroke width
	// dest : desired stroke width
	const y1 = base + sign * source;
	const y2 = base + sign * dest;
	const rounding = (sign > 0) === (source < dest) ? Math.floor : Math.ceil;
	// delta needed for rounding
	let actualDelta = rounding(ROUNDING_SEGMENTS * (y2 - y1) / (upm / ppem));
	// We will try to shrink collided strokes to zero
	let shrunkDelta = isStacked ? rounding(ROUNDING_SEGMENTS * (base - y1) / (upm / ppem)) : 0;
	let delta = actualDelta - shrunkDelta;
	while (!(source < dest && dest <= (1 + 1 / 16) * (upm / ppem) && !isStacked) && delta) {
		const delta1 = (delta > 0 ? delta - 1 : delta + 1);
		const y2a = y1 + (delta1 + shrunkDelta) * (upm / ppem / ROUNDING_SEGMENTS);
		if (roundings.rtg(y2, upm, ppem) !== roundings.rtg(y2a, upm, ppem)
			|| Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > ROUNDING_CUTOFF * (upm / ppem)
			|| (source > dest) && !isStacked && ((y2a - y2) / sign) > (1 / 2) * (upm / ppem) * (ppem / HALF_PIXEL_PPEM)
			|| (isStrict && !isStacked && (Math.abs(y2 - base - (y2a - base)) > (upm / ppem) * (3 / 16)))) break;
		delta = delta1;
	}
	return {
		ppem: ppem,
		delta: (shrunkDelta + delta) / ROUNDING_SEGMENTS
	};
}
*/
// si : size-inpendent actions
// sd : size-dependent actions
// strategy : strategy object
// padding : CVT padding value, padding + 1 -> bottom anchor; padding + 2 -> top anchor
function produceVTTTalk(si, sd, strategy, padding) {
	const upm = strategy.UPM;
	let buf = "";
	function talk(s) { buf += s + "\n"; }
	// bottom
	for (let z of si.bottomBluePoints) {
		talk(`YAnchor(${z},${padding + 2})`);
	}
	// top
	for (let z of si.topBluePoints) {
		talk(`YAnchor(${z},${padding + 1})`);
		let deltas = [];
		for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
			let source = roundings.rtg(strategy.BLUEZONE_TOP_CENTER, upm, ppem);
			let vtop = roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
				+ roundings.rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem);
			deltas.push({
				ppem,
				delta: decideDelta(ROUNDING_SEGMENTS, source, vtop, upm, ppem) / ROUNDING_SEGMENTS
			})
			// deltas.push(decideDelta(source, vtop, upm, ppem));
		}
		talk(sanityDelta(z, deltas));
	}
	for (var sid = 0; sid < si.stems.length; sid++) {
		let s = si.stems[sid];

		let deltaPos = [];
		let deltaADv = [];

		for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
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
		talk(`YNoRound(${s.advKey})`);
		talk(`YDist(${s.posKey},${s.advKey})`);
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
		if (
			si.ipsacalls[l].length > 2
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