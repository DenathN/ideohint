var monoip = require('../support/monotonic-interpolate');
const renderPreview = require('./render').renderPreview;

// models
var defaultStrategy;
var strategy;
var input;
var glyphs;

const render = function () {
	var worker = null;
	function render() {
		if (worker) { worker.terminate(); }
		worker = new Worker('./worker-hint.packed.js');
		worker.onmessage = function (message) {
			worker = null;
			console.log(message.data);
			renderPreview(document.getElementById('preview').getContext('2d'), message.data, strategy);
		}
		worker.postMessage({ input, strategy });
	};
	return render
}();

var strategyControlTypes = {
	RISE: 'VQ',
	SINK: 'VQ',
	RISE_DIAGH: 'VQ',
	SINK_DIAGL: 'VQ',
	TOP_CUT: 'VQ',
	BOTTOM_CUT: 'VQ',
	TOP_CUT_DIAGH: 'VQ',
	TOP_CUT_DIAG_DIST: 'VQ',
	BOTTOM_CUT_DIAGL: 'VQ',
	BOTTOM_CUT_DIAG_DIST: 'VQ',
	GRAVITY: 'VQ',
	CONCENTRATE: 'VQ',
	CHEBYSHEV_4: 'VQ',
	CHEBYSHEV_5: 'VQ',
	CANONICAL_STEM_WIDTH: 'VQ',
	CANONICAL_STEM_WIDTH_DENSE: 'VQ'
}

var strategyControlGroups = [
	['UPM', 'BLUEZONE_WIDTH', 'PPEM_INCREASE_GLYPH_LIMIT'],
	['BLUEZONE_TOP_CENTER', 'BLUEZONE_TOP_LIMIT', 'BLUEZONE_BOTTOM_CENTER', 'BLUEZONE_BOTTOM_LIMIT'],
	['TOP_CUT', 'BOTTOM_CUT', 'TOP_CUT_DIAGH', 'BOTTOM_CUT_DIAGL', 'TOP_CUT_DIAG_DIST', 'BOTTOM_CUT_DIAG_DIST'],
	['RISE', 'SINK', 'RISE_DIAGH', 'SINK_DIAGL', 'GRAVITY', 'CONCENTRATE', 'CHEBYSHEV_4', 'CHEBYSHEV_5'],
	['CANONICAL_STEM_WIDTH', 'CANONICAL_STEM_WIDTH_DENSE'],
	['ABSORPTION_LIMIT', 'STEM_SIDE_MIN_RISE', 'STEM_SIDE_MIN_DESCENT', 'STEM_CENTER_MIN_RISE', 'STEM_CENTER_MIN_DESCENT', 'STEM_SIDE_MIN_DIST_RISE', 'STEM_SIDE_MIN_DIST_DESCENT', 'SLOPE_FUZZ', 'SLOPE_FUZZ_POS', 'SLOPE_FUZZ_NEG', 'Y_FUZZ', 'Y_FUZZ_DIAG']
]

let controls = {};
controls.NUMERIC = function (ol, key, strategy, initVal, callback) {
	var d = document.createElement('li');
	d.innerHTML += '<span>' + key + '</span>';
	var input = document.createElement('input');
	input.value = initVal;
	input.type = 'number';

	input.onchange = function () {
		return callback(input.value - 0);
	};
	function btn(shift) {
		var button = document.createElement('button');
		button.innerHTML = (shift > 0 ? '+' + shift : '-' + (-shift));
		button.onclick = function () {
			input.value = (input.value - 0) + shift;
			return callback(input.value - 0);
		}
		d.appendChild(button)
	};
	btn(-100), btn(-50), btn(-10), btn(-5), btn(-1), btn(-0.1);
	d.appendChild(input);
	btn(0.1), btn(1), btn(5), btn(10), btn(50), btn(100);
	ol.appendChild(d);
}
controls.VQ = function (ol, key, strategy, initVal, callback) {
	var d = document.createElement('li');
	d.className = "VQ";
	d.innerHTML += '<span>' + key + '</span>';

	let vqModel = [], panels = [];
	for (let j = strategy.PPEM_MIN; j <= strategy.PPEM_MAX; j++) {
		vqModel[j] = {
			focus: false,
			val: 0
		}
		let panel = document.createElement('label');
		panel.className = "vq-panel"
		panel.innerHTML += j;
		let input = document.createElement('input');
		input.value = vqModel[j].val;
		input.setAttribute('size', 1);
		input.onfocus = function (e) {
			input.value = '';
		}
		input.onchange = function () {
			vqModel[j].val = (input.value - 0) || 0;
			vqModel[j].focus = true;
			update();
		}
		panel.oncontextmenu = function (e) {
			vqModel[j].focus = !vqModel[j].focus;
			e.stopPropagation();
			e.preventDefault();
			update();
		}
		panel.onwheel = function (e) {
			if (e.deltaY > 0) {
				vqModel[j].val = ((input.value - 0) || 0) - 1;
				vqModel[j].focus = true;
				update();
			} else if (e.deltaY < 0) {
				vqModel[j].val = ((input.value - 0) || 0) + 1;
				vqModel[j].focus = true;
				update();
			}
			e.stopPropagation();
			e.preventDefault();
		}
		panels[j] = {
			panel: panel,
			input: input
		}
		panel.appendChild(input);
		d.appendChild(panel);
	}

	if (initVal && initVal instanceof Array) {
		for (let k of initVal) {
			vqModel[k[0]].focus = true;
			vqModel[k[0]].val = k[1];
		}
	} else if (typeof initVal === 'number') {
		vqModel[strategy.PPEM_MIN].focus = true;
		vqModel[strategy.PPEM_MIN].val = initVal;
		vqModel[strategy.PPEM_MAX].focus = true;
		vqModel[strategy.PPEM_MAX].val = initVal;
	}


	function update(nocb) {
		let a = [];
		for (let j = strategy.PPEM_MIN; j <= strategy.PPEM_MAX; j++) {
			if (vqModel[j].focus) {
				a.push([j, vqModel[j].val || 0]);
			}
			panels[j].input.className = vqModel[j].focus ? "focus" : "interpolated"
		}
		let f = monoip(a);
		for (let j = strategy.PPEM_MIN; j <= strategy.PPEM_MAX; j++) {
			panels[j].input.value = vqModel[j].val = Math.round(f(j));
		}
		if (!nocb) setTimeout(function () { callback(a) }, 0);
	}
	ol.appendChild(d);
	update(true);
};

function createAdjusters() {
	var container = document.getElementById('adjusters');
	function update() {
		setTimeout(render, 100);
		var buf = ['[hinting]'];
		for (var k in strategy) {
			if (strategy[k] !== defaultStrategy[k] && k !== 'gears') {
				buf.push(k + " = " + JSON.stringify(strategy[k]));
			}
		}
		resultPanel.innerHTML = buf.join('<br>');
		return false;
	}
	// Numeric parameters
	for (var g = 0; g < strategyControlGroups.length; g++) {
		var ol = document.createElement('ol')
		for (var j = 0; j < strategyControlGroups[g].length; j++) {
			const key = strategyControlGroups[g][j];
			const keyType = strategyControlTypes[key] || 'NUMERIC';
			controls[keyType](ol, key, strategy, strategy[key], function (x) {
				strategy[key] = x;
				update();
			});
		}
		container.appendChild(ol);
	};
	var save = document.createElement('button');
	save.innerHTML = 'Save';
	save.onclick = function (e) {
		$.post('/save', { content: resultPanel.innerText }, function () { });
		e.preventDefault();
		e.stopPropagation();
	}
	// Result panel
	var resultPanel = document.createElement("pre");
	container.appendChild(save);
	container.appendChild(resultPanel);

	setTimeout(update, 0);
};
$.getJSON("/characters.json", function (data) {
	$.getJSON("/strategy.json", function (strg) {
		console.log(strg);
		defaultStrategy = strg.default;
		strategy = strg.start;
		input = data.filter(x => x);
		createAdjusters();
	});
});