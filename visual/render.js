var roundings = require('../roundings');


function interpolate(a, b, c) {
	if (c.y <= a.y) c.ytouch = c.y - a.y + a.ytouch;
	else if (c.y >= b.y) c.ytouch = c.y - b.y + b.ytouch;
	else c.ytouch = (c.y - a.y) / (b.y - a.y) * (b.ytouch - a.ytouch) + a.ytouch;
}
function interpolateIP(a, b, c) {
	c.touched = true;
	if (a.y === b.y) {
		c.ytouch = c.y - a.y + a.ytouch;
	} else {
		c.ytouch = (c.y - a.y) / (b.y - a.y) * (b.ytouch - a.ytouch) + a.ytouch;
	}
}
function IUPy(contours) {
	for (var j = 0; j < contours.length; j++) {
		var contour = contours[j];
		var k = 0;
		while (k < contour.points.length && !contour.points[k].touched) k++;
		if (contour.points[k]) {
			// Found a touched point in contour
			// Copy coordinates for first/last point
			if (contour.points[0].touched && !contour.points[contour.points.length - 1].touched) {
				contour.points[contour.points.length - 1].touched = true;
				contour.points[contour.points.length - 1].ytouch = contour.points[0].ytouch;
			} else if (!contour.points[0].touched && contour.points[contour.points.length - 1].touched) {
				contour.points[0].touched = true;
				contour.points[0].ytouch = contour.points[contour.points.length - 1].ytouch;
			}
			var kleft = k, k0 = k;
			var untoucheds = []
			for (var k = 0; k <= contour.points.length; k++) {
				var ki = (k + k0) % contour.points.length;
				if (contour.points[ki].touched) {
					var pleft = contour.points[kleft];
					var pright = contour.points[ki];
					var lower = pleft.y < pright.y ? pleft : pright
					var higher = pleft.y < pright.y ? pright : pleft
					for (var w = 0; w < untoucheds.length; w++) interpolate(lower, higher, untoucheds[w]);
					untoucheds = [];
					kleft = ki;
				} else {
					untoucheds.push(contour.points[ki])
				}
			}
		}
	}
}
function untouchAll(contours) {
	for (var j = 0; j < contours.length; j++) for (var k = 0; k < contours[j].points.length; k++) {
		contours[j].points[k].touched = false;
		contours[j].points[k].donttouch = false;
		contours[j].points[k].ytouch = contours[j].points[k].y;
	}
}

function BY_PRIORITY_SHORT(p, q) { return q[2] - p[2] }
function BY_PRIORITY_IP(p, q) { return q[3] - p[3] }

function interpretTT(glyphs, strategy, ppem) {
	const rtg = roundings.Rtg(strategy.UPM, ppem);
	const roundDown = roundings.Rdtg(strategy.UPM, ppem);
	const uppx = strategy.UPM / ppem;

	for (var j = 0; j < glyphs.length; j++) {
		var glyph = glyphs[j].glyph, features = glyphs[j].features;
		untouchAll(glyph.contours);
		var actions = glyphs[j].hints[ppem];

		// Top blues
		features.topBluePoints.forEach(function (pid) {
			glyph.indexedPoints[pid].touched = true;
			glyph.indexedPoints[pid].ytouch = Math.round(rtg(strategy.BLUEZONE_BOTTOM_CENTER) + rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER));
		})
		// Bottom blues
		features.bottomBluePoints.forEach(function (pid) {
			glyph.indexedPoints[pid].touched = true;
			glyph.indexedPoints[pid].ytouch = rtg(strategy.BLUEZONE_BOTTOM_CENTER)
		})
		// Stems
		actions.forEach(function (action, j) {
			var h, l;
			const stem = features.stems[j];
			if (stem.posKeyAtTop) {
				h = glyph.indexedPoints[stem.posKey.id], l = glyph.indexedPoints[stem.advKey.id]
			} else {
				h = glyph.indexedPoints[stem.advKey.id], l = glyph.indexedPoints[stem.posKey.id]
			}
			const yTopTarget = h.ytouch = (action[0]) * uppx;
			const yBotTarget = l.ytouch = (action[0] - action[1]) * uppx;
			h.touched = l.touched = true;
			if (action[2]) return;
			if (stem.posKeyAtTop) {
				const dir = action[1] * uppx > h.y - l.y ? (1 / 16) * uppx : (-1 / 16) * uppx;
				while (rtg(yBotTarget) === rtg(l.ytouch) && (action[3] || (dir > 0
					? yTopTarget - l.ytouch > h.y - l.y
					: yTopTarget - l.ytouch < h.y - l.y))) {
					l.ytouch += dir;
				}
			} else {
				const dir = action[1] * uppx > h.y - l.y ? (-1 / 16) * uppx : (1 / 16) * uppx;
				while (rtg(yTopTarget) === rtg(h.ytouch) && (action[3] || (dir > 0
					? h.ytouch - yBotTarget < h.y - l.y
					: h.ytouch - yBotTarget > h.y - l.y))) {
					h.ytouch += dir;
				}
			}
		});
		// Alignments
		glyph.stems.forEach(function (stem) {
			stem.posAlign.forEach(function (pt) {
				pt = glyph.indexedPoints[pt.id]
				pt.touched = true;
				pt.ytouch = glyph.indexedPoints[stem.posKey.id].ytouch
			})
			stem.advAlign.forEach(function (pt) {
				pt = glyph.indexedPoints[pt.id]
				pt.touched = true;
				pt.ytouch = glyph.indexedPoints[stem.advKey.id].ytouch
			})
		});
		// IPs
		var g = [];
		features.shortAbsorptions.forEach(function (s) {
			var priority = s[2];
			if (!g[priority]) g[priority] = {
				interpolations: [],
				absorptions: [],
				pri: priority
			}
			g[priority].absorptions.push(s);
		});
		features.interpolations.forEach(function (s) {
			var priority = s[3];
			if (!g[priority]) g[priority] = {
				interpolations: [],
				absorptions: [],
				pri: priority
			}
			g[priority].interpolations.push(s);
		});
		g.reverse().forEach(function (group) {
			if (!group) return;
			group.absorptions.forEach(function (group) {
				var a = glyph.indexedPoints[group[0]]
				var b = glyph.indexedPoints[group[1]]
				b.touched = true;
				b.ytouch = b.y + a.ytouch - a.y;
			});
			group.interpolations.forEach(function (group) {
				var a = glyph.indexedPoints[group[0]]
				var b = glyph.indexedPoints[group[1]]
				var c = glyph.indexedPoints[group[2]]
				interpolateIP(a, b, c)
			});
		});

		// IUPy
		IUPy(glyph.contours);
	};
}

const SUPERSAMPLING = 8;
const SAMPLING_Y = 1;
const DPI = 2;
const GAMMA = 2.2;
function RenderPreviewForPPEM(glyphs, strategy, hdc, basex, basey, ppem) {
	const uppx = strategy.UPM / ppem;

	interpretTT(glyphs, strategy, ppem);

	// Create a temp canvas
	var eTemp = document.createElement('canvas')
	eTemp.width = ppem * glyphs.length * 3 * SUPERSAMPLING;
	eTemp.height = (ppem * 3 + 3) * SAMPLING_Y;
	var hTemp = eTemp.getContext('2d')
	hTemp.fillStyle = "white";
	hTemp.fillRect(0, 0, eTemp.width, eTemp.height);

	function txp(x) { return (x / uppx) * 3 * SUPERSAMPLING }
	function typ(y) { return ((-y / uppx + Math.round(strategy.BLUEZONE_TOP_CENTER / uppx)) * 3 + 3) * SAMPLING_Y }
	// Fill
	hTemp.fillStyle = 'black';
	for (var m = 0; m < glyphs.length; m++) {
		hTemp.beginPath();
		for (var j = 0; j < glyphs[m].glyph.contours.length; j++) {
			var contour = glyphs[m].glyph.contours[j];
			hTemp.moveTo(txp(contour.points[0].xtouch + m * strategy.UPM), typ(contour.points[0].ytouch))
			for (var k = 1; k < contour.points.length; k++) {
				if (contour.points[k].on || !contour.points[k + 1]) {
					hTemp.lineTo(txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch))
				} else {
					hTemp.quadraticCurveTo(
						txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch),
						txp(contour.points[k + 1].xtouch + m * strategy.UPM), typ(contour.points[k + 1].ytouch))
					k += 1;
				}
			}
			hTemp.closePath();
		}
		hTemp.fill('nonzero');
	};

	// Downsampling
	var ori = hTemp.getImageData(0, 0, eTemp.width, eTemp.height);
	var vpixels = eTemp.height / 3;
	const eAA = document.createElement('canvas');
	eAA.width = ppem * glyphs.length * DPI;
	eAA.height = vpixels * DPI;
	const hAA = eAA.getContext('2d');
	var aa = hAA.createImageData(eAA.width, eAA.height);
	for (var j = 0; j < aa.width; j++) for (var k = 0; k < aa.height; k++) {
		aa.data[(k * aa.height + j) * 4] = 0xFF;
		aa.data[(k * aa.height + j) * 4 + 1] = 0xFF;
		aa.data[(k * aa.height + j) * 4 + 2] = 0xFF;
		aa.data[(k * aa.height + j) * 4 + 3] = 0xFF;
	}
	var w = 4 * eTemp.width;
	var h = []; for (var j = 0; j < 3 * SUPERSAMPLING; j++) h[j] = 1;
	var jSample = 0;
	var a = 3 * SUPERSAMPLING;
	for (var j = 0; j < vpixels; j++) {
		for (var k = 0; k < ppem * glyphs.length; k++) {
			for (var component = 0; component < 3; component++) {
				for (var ss = 0; ss < SUPERSAMPLING; ss++) {
					var d = Math.pow(ori.data[w] / 255, GAMMA);
					a += d
					a -= h[jSample]
					h[jSample] = d;
					w += 4;
					jSample += 1;
					if (jSample >= 3 * SUPERSAMPLING) jSample = 0;
				}
				var alpha = a / (3 * SUPERSAMPLING);
				for (var dr = 0; dr < DPI; dr++) for (var dc = 0; dc < DPI; dc++) {
					aa.data[((j * DPI + dr) * aa.width + k * DPI + dc) * 4 + component] = 255 * Math.pow(alpha, 1 / GAMMA)
				}
			}
			for (var dr = 0; dr < DPI; dr++) for (var dc = 0; dc < DPI; dc++) {
				aa.data[((j * DPI + dr) * aa.width + k * DPI + dc) * 4 + 3] = 255
			}
		}
		w += 4 * 2 * 3 * ppem * glyphs.length * SUPERSAMPLING
	};
	hAA.putImageData(aa, 0, 0);
	hdc.imageSmoothingEnabled = true;
	hdc.drawImage(eAA, basex, basey, eAA.width, eAA.height / SAMPLING_Y);
};


function renderPreview(hPreview, glyphs, strategy) {
	hPreview.font = (12 * DPI) + 'px sans-serif'
	var y = 10 * DPI;
	for (var ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
		// fill with red block
		hPreview.fillStyle = 'white';
		hPreview.fillRect(0, y, 128 + glyphs.length * DPI * ppem, y + DPI * ppem)
		// render 
		setTimeout(function (y, ppem) {
			return function () {
				RenderPreviewForPPEM(glyphs, strategy, hPreview, 128, y, ppem)
			}
		}(y, ppem), 0);
		hPreview.fillStyle = 'black';
		hPreview.fillText(ppem + '', 0, y + ppem * (strategy.BLUEZONE_TOP_CENTER / strategy.UPM) * DPI)
		y += Math.round(ppem * 1.2) * DPI
	}
}

module.exports = renderPreview;