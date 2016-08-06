var parseSFD = require('../sfdParser').parseSFD;
var findStems = require('../findstem').findStems;
var extractFeature = require('../extractfeature').extractFeature;
var hint = require('../hinter').hint;
var roundings = require('../roundings');



var defaultStrategy;
var strategy;
var input;
var glyphs;
function interpolate(a, b, c){
	if(c.yori <= a.yori) c.ytouch = c.yori - a.yori + a.ytouch;
	else if(c.yori >= b.yori) c.ytouch = c.yori - b.yori + b.ytouch;
	else c.ytouch = (c.yori - a.yori) / (b.yori - a.yori) * (b.ytouch - a.ytouch) + a.ytouch;
}
function interpolateIP(a, b, c){
	c.touched = true;
	c.ytouch = (c.yori - a.yori) / (b.yori - a.yori) * (b.ytouch - a.ytouch) + a.ytouch;
}
function IUPy(contours){
	for(var j = 0; j < contours.length; j++){
		var contour = contours[j];
		var k = 0;
		while(k < contour.points.length && !contour.points[k].touched) k++;
		if(contour.points[k]) {
			// Found a touched point in contour
			var kleft = k, k0 = k;
			var untoucheds = []
			for(var k = 0; k <= contour.points.length; k++){
				var ki = (k + k0) % contour.points.length;
				if(contour.points[ki].touched){
					var pleft = contour.points[kleft];
					var pright = contour.points[ki];
					var lower = pleft.yori < pright.yori ? pleft : pright
					var higher = pleft.yori < pright.yori ? pright : pleft
					for(var w = 0; w < untoucheds.length; w++) interpolate(lower, higher, untoucheds[w]);
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
	for(var j = 0; j < contours.length; j++) for(var k = 0; k < contours[j].points.length; k++) {
		contours[j].points[k].touched = false;
		contours[j].points[k].donttouch = false;
		contours[j].points[k].ytouch = contours[j].points[k].yori;
	}
}
var SUPERSAMPLING = 8;
var DPI = 2;
function BY_PRIORITY_SHORT(p, q){ return q[2] - p[2] }
function BY_PRIORITY_IP(p, q){ return q[3] - p[3] }
function RenderPreviewForPPEM(hdc, basex, basey, ppem) {
	var rtg = roundings.Rtg(strategy.UPM, ppem);
	var roundDown = roundings.Rdtg(strategy.UPM, ppem);

	for(var j = 0; j < glyphs.length; j++){
		var glyph = glyphs[j].glyph, features = glyphs[j].features;
		untouchAll(glyph.contours);
		var actions = hint(features, ppem, strategy);

		// Top blues
		features.topBluePoints.forEach(function(pid){
			glyph.indexedPoints[pid].touched = true;
			glyph.indexedPoints[pid].ytouch = Math.round(rtg(strategy.BLUEZONE_BOTTOM_CENTER) + roundDown(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER));
		})
		// Bottom blues
		features.bottomBluePoints.forEach(function(pid){ 
			glyph.indexedPoints[pid].touched = true;
			glyph.indexedPoints[pid].ytouch = rtg(strategy.BLUEZONE_BOTTOM_CENTER)
		})
		// Stems
		actions.forEach(function(action){
			glyph.indexedPoints[action.pos[1]].ytouch = action.pos[3];
			glyph.indexedPoints[action.adv[2]].ytouch = action.pos[3] + (action.orient ? (-1) : 1) * (action.adv[4] || Math.round(action.adv[3])) * (strategy.UPM / ppem);
			glyph.indexedPoints[action.pos[1]].touched = glyph.indexedPoints[action.adv[2]].touched = true
		});
		// Alignments
		glyph.stems.forEach(function(stem){
			stem.posAlign.forEach(function(pt){
				pt = glyph.indexedPoints[pt.id]
				pt.touched = true;
				pt.ytouch = glyph.indexedPoints[stem.posKey.id].ytouch
			})
			stem.advAlign.forEach(function(pt){
				pt = glyph.indexedPoints[pt.id]
				pt.touched = true;
				pt.ytouch = glyph.indexedPoints[stem.advKey.id].ytouch
			})
		});
		// IPs
		features.shortAbsorptions.sort(BY_PRIORITY_SHORT).forEach(function(group){
			var a = glyph.indexedPoints[group[0]]
			var b = glyph.indexedPoints[group[1]]
			b.touched = true;
			b.ytouch = b.yori + a.ytouch - a.yori;
		});
		// IPs
		features.interpolations.sort(BY_PRIORITY_IP).forEach(function(group){
			var a = glyph.indexedPoints[group[0]]
			var b = glyph.indexedPoints[group[1]]
			var c = glyph.indexedPoints[group[2]]
			interpolateIP(a, b, c)
		});

		// IUPy
		IUPy(glyph.contours);
	};

	// Create a temp canvas
	var eTemp = document.createElement('canvas')
	eTemp.width = ppem * glyphs.length * 3 * SUPERSAMPLING;
	eTemp.height = ppem * 3;
	var hTemp = eTemp.getContext('2d')
	hTemp.fillStyle = "white";
	hTemp.fillRect(0, 0, eTemp.width, eTemp.height);

	function txp(x){ return (x / strategy.UPM * ppem) * 3 * SUPERSAMPLING }
	function typ(y){ return (Math.round(-y / strategy.UPM * ppem) + Math.round(strategy.BLUEZONE_TOP_CENTER / strategy.UPM * ppem)) * 3}
	// Fill
	hTemp.fillStyle = 'black';
	for(var m = 0; m < glyphs.length; m++){
		hTemp.beginPath();
		for(var j = 0; j < glyphs[m].glyph.contours.length; j++){
			var contour = glyphs[m].glyph.contours[j];
			// Layer 1 : Control outline
			hTemp.moveTo(txp(contour.points[0].xtouch + m * strategy.UPM), typ(contour.points[0].ytouch))
			for(var k = 1; k < contour.points.length; k++){
				if(contour.points[k].on) hTemp.lineTo(txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch))
				else {
					hTemp.quadraticCurveTo(txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch), txp(contour.points[k + 1].xtouch + m * strategy.UPM), typ(contour.points[k + 1].ytouch))
					k += 1;
				}
			}
			hTemp.closePath();
		}
		hTemp.fill('nonzero');
	};

	// Downsampling
	var ori = hTemp.getImageData(0, 0, eTemp.width, eTemp.height);
	var aa = hdc.createImageData(ppem * glyphs.length * DPI, ppem * DPI)
	var w = 4 * eTemp.width;
	var h = []; for(var j = 0; j < 3 * SUPERSAMPLING; j++) h[j] = 1;
	var jSample = 0;
	var a = 3 * SUPERSAMPLING;
	for(var j = 0; j < ppem; j++) {
		for(var k = 0; k < ppem * glyphs.length; k++) {
			for(var component = 0; component < 3; component++) {
				for(var ss = 0; ss < SUPERSAMPLING; ss++) {
					var d = ori.data[w] / 255;
					a += d 
					a -= h[jSample]
					h[jSample] = d;
					w += 4;
					jSample += 1;
					if(jSample >= 3 * SUPERSAMPLING) jSample = 0;
				}
				var alpha = a / (3 * SUPERSAMPLING);
				for(var dr = 0; dr < DPI; dr++) for(var dc = 0; dc < DPI; dc++){
					aa.data[((j * DPI + dr) * aa.width + k * DPI + dc) * 4 + component] = 255 * Math.pow(alpha, 1 / 2.2)
				}
			}
			for(var dr = 0; dr < DPI; dr++) for(var dc = 0; dc < DPI; dc++){
				aa.data[((j * DPI + dr) * aa.width + k * DPI + dc) * 4 + 3] = 255
			}
		}
		w += 4 * 2 * 3 * SUPERSAMPLING * ppem * glyphs.length
	};
	hdc.putImageData(aa, basex, basey)
};

function render(){
	glyphs = input.map(function(passage, j){
		if(passage){
			var glyph = parseSFD(passage.slice(9, -12))
			return {
				glyph : glyph,
				features: extractFeature(findStems(glyph, strategy), strategy)
			}
		}
	});
	var hPreview = document.getElementById('preview').getContext('2d');
	hPreview.font = (12 * DPI) + 'px sans-serif'
	var y = 10 * DPI;
	for(var ppem = 10; ppem < 36; ppem++) {
		// fill with red block
		hPreview.fillStyle = 'white';
		hPreview.fillRect(0, y, 128 + glyphs.length * DPI * ppem, y + DPI * ppem)
		// render 
		setTimeout(function(y, ppem){return function(){ RenderPreviewForPPEM(hPreview, 128, y, ppem)}}(y, ppem), 0);
		hPreview.fillStyle = 'black';
		hPreview.fillText(ppem + '', 0, y + ppem * (strategy.BLUEZONE_TOP_CENTER / strategy.UPM) * DPI)
		y += Math.round(ppem * 1.2) * DPI
	}
};

var strategyControlGroups = [
	['UPM', 'BLUEZONE_WIDTH', 'BLUEZONE_TOP_CENTER', 'BLUEZONE_TOP_LIMIT', 'BLUEZONE_TOP_BAR', 'BLUEZONE_TOP_DOTBAR', 'BLUEZONE_BOTTOM_CENTER', 'BLUEZONE_BOTTOM_LIMIT', 'BLUEZONE_BOTTOM_BAR', 'BLUEZONE_BOTTOM_DOTBAR'],
	['MIN_STEM_WIDTH', 'MAX_STEM_WIDTH', 'MOST_COMMON_STEM_WIDTH', 'STEM_SIDE_MIN_RISE', 'STEM_SIDE_MIN_DESCENT', 'STEM_CENTER_MIN_RISE', 'STEM_CENTER_MIN_DESCENT', 'STEM_SIDE_MIN_DIST_RISE', 'STEM_SIDE_MIN_DIST_DESCENT', 'SLOPE_FUZZ', 'Y_FUZZ'],
	['POPULATION_LIMIT', 'CHILDREN_LIMIT', 'EVOLUTION_STAGES', 'MUTANT_PROBABLITY', 'ELITE_COUNT'],
	['COEFF_DISTORT', 'ABLATION_IN_RADICAL', 'ABLATION_RADICAL_EDGE', 'ABLATION_GLYPH_EDGE', 'ABLATION_GLYPH_HARD_EDGE', 'COEFF_PORPORTION_DISTORTION', 'COEFF_A_MULTIPLIER', 'COEFF_A_SAME_RADICAL', 'COEFF_A_SHAPE_LOST', 'COEFF_A_FEATURE_LOSS', 'COEFF_A_RADICAL_MERGE', 'COEFF_C_MULTIPLIER', 'COEFF_C_SAME_RADICAL', 'COEFF_S', 'COLLISION_MIN_OVERLAP_RATIO']
]

function createAdjusters(){
	var container = document.getElementById('adjusters');
	function update(){
		setTimeout(render, 100);
		console.log(strategy);
		var buf = [];
		for(var k in strategy) if((typeof strategy[k] === 'number' || typeof strategy[k] === 'string') && strategy[k] !== defaultStrategy[k]) buf.push("--" + k + "=" + strategy[k]);
		resultPanel.innerHTML = buf.join(' ');
		return false;
	}
	// Numeric parameters
	for(var g = 0; g < strategyControlGroups.length; g++) {
		var ol = document.createElement('ol')
		for(var j = 0; j < strategyControlGroups[g].length; j++){
			var key = strategyControlGroups[g][j];
			if(typeof strategy[key] === 'number') (function(key){
				var d = document.createElement('li');
				d.innerHTML += '<span>' + key + '</span>';
				var input = document.createElement('input');
				input.value = strategy[key];
				input.type = 'number';

				input.onchange = function(){
					strategy[key] = input.value - 0;
					update();
				};
				function btn(shift){
					var button = document.createElement('button');
					button.innerHTML = (shift > 0 ? '+' + shift : '-' + (-shift));
					button.onclick = function(){
						strategy[key] += shift;
						input.value = strategy[key]
						update();
					}
					d.appendChild(button)
				};
				btn(-100)
				btn(-50)
				btn(-10)
				btn(-5)
				btn(-1)
				btn(-0.1)
				d.appendChild(input);
				btn(0.1)
				btn(1)
				btn(5)
				btn(10)
				btn(50)
				btn(100)
				ol.appendChild(d);
			})(key)
		}
		container.appendChild(ol);
	};
	// --gears
	(function(){
		var ol = document.createElement('ol');
		var d = document.createElement('li');
		d.innerHTML += '<span>gears</span>';
		d.className = "text"
		var input = document.createElement('input');
		input.value = JSON.stringify(strategy.PPEM_STEM_WIDTH_GEARS);
		input.onchange = function(){
			try {
				var g = JSON.parse(input.value);
				strategy.PPEM_STEM_WIDTH_GEARS = g;
				strategy.gears = JSON.stringify(input.value);
				update();
			} catch(ex) {
				
			}
		};
		d.appendChild(input);
		ol.appendChild(d);
		container.appendChild(ol);
	})();
	// Result panel
	var resultPanel = document.createElement("div");
	container.appendChild(resultPanel);
	
	setTimeout(update, 0);
};
$.getJSON("/characters.json", function(data){
	$.getJSON("/strategy.json", function(strg){
		defaultStrategy = strg.default;
		strategy = strg.start;
		input = data;
		createAdjusters();
	});
});