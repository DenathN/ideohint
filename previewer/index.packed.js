(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],4:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":3,"_process":2,"inherits":1}],5:[function(require,module,exports){
toposort = require('toposort');

function slopeOf(segs) {
	var sy = 0, sx = 0, n = 0;
	for (var j = 0; j < segs.length; j++) for (var k = 0; k < segs[j].length; k++) {
		sy += segs[j][k].yori;
		sx += segs[j][k].xori;
		n += 1;
	};
	var ax = sx / n, ay = sy / n;
	var b1num = 0, b1den = 0;
	for (var j = 0; j < segs.length; j++) for (var k = 0; k < segs[j].length; k++) {
		b1num += (segs[j][k].xori - ax) * (segs[j][k].yori - ay);
		b1den += (segs[j][k].xori - ax) * (segs[j][k].xori - ax);
	};
	return b1num / b1den
}
function intercept(point, slope) {
	return point.yori - point.xori * slope;
}
function TransitionClosure(d) {
	var o = [];
	for (var j = 0; j < d.length; j++) { o[j] = d[j].slice(0) };
	for (var m = 0; m < o.length; m++)
		for (var j = 0; j < o.length; j++)
			for (var k = 0; k < o.length; k++) o[j][k] = o[j][k] || o[j][m] && o[m][k];
	return o;
}
exports.extractFeature = function (glyph, strategy) {
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE || STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT || STEM_SIDE_MIN_DESCENT;
	function atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > STEM_SIDE_MIN_RISE)
	}
	function atGlyphTop(stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
			&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > STEM_SIDE_MIN_RISE)
	}
	function atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > STEM_SIDE_MIN_DESCENT)
	};
	function atGlyphBottom(stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
			&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
	};
	// Stem Keypoints
	for (var js = 0; js < glyph.stems.length; js++) {
		var s = glyph.stems[js];
		var b = !s.hasSameRadicalStemBelow
			&& !(s.hasRadicalPointBelow && s.radicalCenterDescent > strategy.STEM_CENTER_MIN_DESCENT)
			&& !(s.hasRadicalLeftAdjacentPointBelow && s.radicalLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
			&& !(s.hasRadicalRightAdjacentPointBelow && s.radicalRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
			&& !s.hasGlyphStemBelow
		var slope = (slopeOf(s.high) + slopeOf(s.low)) / 2
		// get highkey and lowkey
		var highkey = s.high[0][0], lowkey = s.low[0][0], highnonkey = [], lownonkey = [];
		var jHigh = 0, jLow = 0;
		for (var j = 0; j < s.high.length; j++) for (var k = 0; k < s.high[j].length; k++) if (s.high[j][k].id >= 0 && s.high[j][k].xori < highkey.xori) {
			highkey = s.high[j][k];
			jHigh = j;
		}
		for (var j = 0; j < s.low.length; j++) for (var k = 0; k < s.low[j].length; k++) if (s.low[j][k].id >= 0 && s.low[j][k].xori < lowkey.xori) {
			lowkey = s.low[j][k];
			jLow = j;
		}
		highkey.touched = lowkey.touched = true;
		for (var j = 0; j < s.high.length; j++) for (var k = 0; k < s.high[j].length; k++) {
			if (j !== jHigh) {
				if (k === 0) {
					highnonkey.push(s.high[j][k])
					s.high[j][k].touched = true;
				} else {
					s.high[j][k].donttouch = true;
				}
			} else if (s.high[j][k] !== highkey) {
				s.high[j][k].donttouch = true;
			}
		}
		for (var j = 0; j < s.low.length; j++) for (var k = 0; k < s.low[j].length; k++) {
			if (j !== jLow) {
				if (k === s.low[j].length - 1) {
					lownonkey.push(s.low[j][k])
					s.low[j][k].touched = true
				} else {
					s.low[j][k].donttouch = true
				}
			} else if (s.low[j][k] !== lowkey) {
				s.low[j][k].donttouch = true
			}
		};
		s.yori = highkey.yori;
		s.width = highkey.yori - lowkey.yori;
		s.posKey = b ? lowkey : highkey;
		s.advKey = b ? highkey : lowkey;
		s.posAlign = b ? lownonkey : highnonkey;
		s.advAlign = b ? highnonkey : lownonkey;
		s.posKeyAtTop = !b;
		s.posKey.keypoint = true;
	}

	// Blue zone points
	var topBluePoints = [];
	var bottomBluePoints = [];
	for (var j = 0; j < glyph.contours.length; j++) {
		for (var k = 0; k < glyph.contours[j].points.length - 1; k++) {
			var point = glyph.contours[j].points[k];
			if (point.ytouch >= strategy.BLUEZONE_TOP_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				topBluePoints.push(point);
			}
			if (point.ytouch <= strategy.BLUEZONE_BOTTOM_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				bottomBluePoints.push(point);
			}

		}
	}

	// Interpolations
	var interpolations = [];
	var shortAbsorptions = [];
	function BY_YORI(p, q) { return p.yori - q.yori }

	function interpolateByKeys(pts, keys, inSameRadical, priority, ckonly) {
		for (var k = 0; k < pts.length; k++) {
			var pt = pts[k];
			if (!pt.touched && !pt.donttouch && pt.on && strategy.DO_SHORT_ABSORPTION && inSameRadical) {
				for (var m = 0; m < keys.length; m++) {
					var key = keys[m];
					if (
						key.blued && key.yStrongExtrema && Math.hypot(pt.yori - key.yori, pt.xori - key.xori) <= strategy.ABSORPTION_LIMIT && pt.xStrongExtrema
						|| Math.abs(key.yori - pt.yori) <= strategy.BLUEZONE_WIDTH && Math.hypot(pt.yori - key.yori, pt.xori - key.xori) <= strategy.MAX_STEM_WIDTH && ckonly) {
						shortAbsorptions.push([key.id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
						pt.touched = true;
						break;
					}
				}
			};
			if (!pt.touched && !pt.donttouch) {
				out: for (var m = keys.length - 2; m >= 0; m--) if (keys[m].yori < pt.yori - strategy.BLUEZONE_WIDTH) {
					for (var n = m + 1; n < keys.length; n++) if (keys[n].yori - keys[m].yori > strategy.BLUEZONE_WIDTH && keys[n].yori > pt.yori + strategy.BLUEZONE_WIDTH) {
						interpolations.push([keys[m].id, keys[n].id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
						pt.touched = true;
						break out;
					}
				}
			}
		}
	}
	function findInterpolates(contours) {
		var glyphKeypoints = [];
		for (var j = 0; j < contours.length; j++) for (var k = 0; k < contours[j].points.length; k++) {
			if (contours[j].points[k].touched && contours[j].points[k].keypoint) {
				glyphKeypoints.push(contours[j].points[k]);
			}
		};
		glyphKeypoints = glyphKeypoints.sort(BY_YORI);
		var records = [];

		for (var j = 0; j < contours.length; j++) {
			var contourpoints = contours[j].points
			var contourKeypoints = contourpoints.filter(function (p) { return p.touched }).sort(BY_YORI);
			var contourExtrema = contourpoints.filter(function (p) { return p.xExtrema || p.yExtrema }).sort(BY_YORI);

			if (contourExtrema.length > 1) {
				var topbot = [contourExtrema[0], contourExtrema[contourExtrema.length - 1]];
				var midex = contourExtrema.slice(1, -1);
				records.push({
					topbot: topbot,
					midex: midex,
					ck: contourKeypoints,
					ckx: contourKeypoints.concat(topbot).sort(BY_YORI)
				})
			} else {
				records.push({
					topbot: [],
					midex: midex,
					ck: contourKeypoints,
					ckx: contourKeypoints
				})
			}
		};
		for (var j = 0; j < contours.length; j++) {
			if (records[j].ck.length > 1) {
				interpolateByKeys(records[j].topbot, records[j].ck, true, 3, true)
			}
			interpolateByKeys(records[j].topbot, glyphKeypoints, false, 3)
		};
		for (var j = 0; j < contours.length; j++) {
			if (records[j].ckx.length > 1) {
				interpolateByKeys(records[j].midex, records[j].ckx, true, 1, true)
			}
			interpolateByKeys(records[j].midex, glyphKeypoints, false, 1)
		};
	};
	findInterpolates(glyph.contours);
	function edgetouch(s, t) {
		if (s.xmax - s.xmin < t.xmax - t.xmin) return edgetouch(t, s);
		return (s.xmin < t.xmin && t.xmin < s.xmax && s.xmax < t.xmax && (s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.2)
			|| (t.xmin < s.xmin && s.xmin < t.xmax && t.xmax < s.xmax && (t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.2)
	};
	function between(t, m, b) {
		return t.xmin < m.xmin && m.xmax < t.xmax && b.xmin < m.xmin && m.xmax < b.xmax
	}
	var directOverlaps = (function () {
		var d = [];
		for (var j = 0; j < glyph.stemOverlaps.length; j++) {
			d[j] = [];
			for (var k = 0; k < j; k++) {
				d[j][k] = glyph.stemOverlaps[j][k] > strategy.COLLISION_MIN_OVERLAP_RATIO && !edgetouch(glyph.stems[j], glyph.stems[k])
			}
		};
		for (var x = 0; x < d.length; x++) for (var y = 0; y < d.length; y++) for (var z = 0; z < d.length; z++) {
			if (d[x][y] && d[y][z]) d[x][z] = false;
		};
		return d;
	})();
	var edgeTouches = (function () {
		var d = [];
		for (var j = 0; j < glyph.stemOverlaps.length; j++) {
			d[j] = [];
			for (var k = 0; k < j; k++) {
				d[j][k] = edgetouch(glyph.stems[j], glyph.stems[k]);
			}
		};
		return d;
	})();
	var overlaps = TransitionClosure(directOverlaps);
	var blanks = function () {
		var blanks = [];
		for (var j = 0; j < directOverlaps.length; j++) {
			blanks[j] = [];
			for (var k = 0; k < directOverlaps.length; k++) {
				blanks[j][k] = glyph.stems[j].yori - glyph.stems[j].width - glyph.stems[k].yori;
			}
		};
		return blanks;
	} ();
	var triplets = function () {
		var triplets = [];
		for (var j = 0; j < glyph.stems.length; j++) for (var k = 0; k < j; k++) for (var w = 0; w < k; w++) if (directOverlaps[j][k] && blanks[j][k] >= 0 && blanks[k][w] >= 0) {
			triplets.push([j, k, w, blanks[j][k] - blanks[k][w]]);
		};
		return triplets;
	} ();
	var flexes = function () {
		var edges = [], t = [], b = [];
		for (var j = 0; j < glyph.stems.length; j++) {
			t[j] = glyph.stems.length - 1;
			b[j] = 0;
		}
		for (var j = glyph.stems.length - 1; j >= 0; j--) {
			if (j > 0 && j < glyph.stems.length - 1) edges.push([0, j], [glyph.stems.length - 1, j]);
			for (var k = 0; k < j; k++) for (var w = glyph.stems.length - 1; w > j; w--) {
				if (blanks[j][k] >= 0 && blanks[w][j] >= 0 && between(glyph.stems[w], glyph.stems[j], glyph.stems[k])) {
					edges.push([w, j], [k, j]);
					t[j] = w; b[j] = k;
				}
			}
		};
		var order = toposort(edges);
		var flexes = []
		for (var j = 0; j < order.length; j++) {
			if (t[order[j]] >= 0 && b[order[j]] >= 0 && t[order[j]] !== order[j] && b[order[j]] !== order[j]) {
				flexes.push([t[order[j]], order[j], b[order[j]]]);
			}
		};
		return flexes;
	} ();
	return {
		stats: glyph.stats,
		stems: glyph.stems.map(function (s) {
			return {
				xmin: s.xmin,
				xmax: s.xmax,
				yori: s.yori,
				width: s.width,
				atGlyphTop: s.atGlyphTop,
				atGlyphBottom: s.atGlyphBottom,
				belongRadical: s.belongRadical,

				hasGlyphStemAbove: s.hasGlyphStemAbove,
				hasSameRadicalStemAbove: s.hasSameRadicalStemAbove,
				hasRadicalPointAbove: s.hasRadicalPointAbove,
				radicalCenterRise: s.radicalCenterRise,
				hasGlyphPointAbove: s.hasGlyphPointAbove,
				glyphCenterRise: s.glyphCenterRise,
				hasRadicalLeftAdjacentPointAbove: s.hasRadicalLeftAdjacentPointAbove,
				hasRadicalRightAdjacentPointAbove: s.hasRadicalRightAdjacentPointAbove,
				radicalRightAdjacentRise: s.radicalRightAdjacentRise,
				radicalLeftAdjacentRise: s.radicalLeftAdjacentRise,
				hasGlyphLeftAdjacentPointAbove: s.hasGlyphLeftAdjacentPointAbove,
				hasGlyphRightAdjacentPointAbove: s.hasGlyphRightAdjacentPointAbove,
				glyphRightAdjacentRise: s.glyphRightAdjacentRise,
				glyphLeftAdjacentRise: s.glyphLeftAdjacentRise,
				hasRadicalLeftDistancedPointAbove: s.hasRadicalLeftDistancedPointAbove,
				hasRadicalRightDistancedPointAbove: s.hasRadicalRightDistancedPointAbove,
				radicalRightDistancedRise: s.radicalRightDistancedRise,
				radicalLeftDistancedRise: s.radicalLeftDistancedRise,
				hasGlyphLeftDistancedPointAbove: s.hasGlyphLeftDistancedPointAbove,
				hasGlyphRightDistancedPointAbove: s.hasGlyphRightDistancedPointAbove,
				glyphRightDistancedRise: s.glyphRightDistancedRise,
				glyphLeftDistancedRise: s.glyphLeftDistancedRise,

				hasGlyphStemBelow: s.hasGlyphStemBelow,
				hasSameRadicalStemBelow: s.hasSameRadicalStemBelow,
				hasRadicalPointBelow: s.hasRadicalPointBelow,
				radicalCenterDescent: s.radicalCenterDescent,
				hasGlyphPointBelow: s.hasGlyphPointBelow,
				glyphCenterDescent: s.glyphCenterDescent,
				hasRadicalLeftAdjacentPointBelow: s.hasRadicalLeftAdjacentPointBelow,
				hasRadicalRightAdjacentPointBelow: s.hasRadicalRightAdjacentPointBelow,
				radicalLeftAdjacentDescent: s.radicalLeftAdjacentDescent,
				radicalRightAdjacentDescent: s.radicalRightAdjacentDescent,
				hasGlyphLeftAdjacentPointBelow: s.hasGlyphLeftAdjacentPointBelow,
				hasGlyphRightAdjacentPointBelow: s.hasGlyphRightAdjacentPointBelow,
				glyphLeftAdjacentDescent: s.glyphLeftAdjacentDescent,
				glyphRightAdjacentDescent: s.glyphRightAdjacentDescent,
				hasRadicalLeftDistancedPointBelow: s.hasRadicalLeftDistancedPointBelow,
				hasRadicalRightDistancedPointBelow: s.hasRadicalRightDistancedPointBelow,
				radicalLeftDistancedDescent: s.radicalLeftDistancedDescent,
				radicalRightDistancedDescent: s.radicalRightDistancedDescent,
				hasGlyphLeftDistancedPointBelow: s.hasGlyphLeftDistancedPointBelow,
				hasGlyphRightDistancedPointBelow: s.hasGlyphRightDistancedPointBelow,
				glyphLeftDistancedDescent: s.glyphLeftDistancedDescent,
				glyphRightDistancedDescent: s.glyphRightDistancedDescent,

				hasGlyphFoldBelow: s.hasGlyphFoldBelow,
				hasRadicalFoldBelow: s.hasRadicalFoldBelow,
				hasGlyphSideFoldBelow: s.hasGlyphSideFoldBelow,
				hasRadicalSideFoldBelow: s.hasRadicalSideFoldBelow,
				hasGlyphVFoldBelow: s.hasGlyphVFoldBelow,
				hasRadicalVFoldBelow: s.hasRadicalVFoldBelow,

				posKey: { id: s.posKey.id, yori: s.posKey.yori },
				advKey: { id: s.advKey.id, yori: s.advKey.yori },
				posAlign: s.posAlign.map(function (x) { return x.id }),
				advAlign: s.advAlign.map(function (x) { return x.id }),
				posKeyAtTop: s.posKeyAtTop
			}
		}),
		stemOverlaps: glyph.stemOverlaps,
		directOverlaps: directOverlaps,
		edgeTouches: edgeTouches,
		overlaps: overlaps,
		triplets: triplets,
		flexes: flexes,
		collisionMatrices: glyph.collisionMatrices,
		topBluePoints: topBluePoints.map(function (x) { return x.id }),
		bottomBluePoints: bottomBluePoints.map(function (x) { return x.id }),
		interpolations: interpolations,
		shortAbsorptions: shortAbsorptions
	}
}
},{"toposort":8}],6:[function(require,module,exports){
function findStems(glyph, strategy) {
	var upm = strategy.UPM || 1000;

	var MIN_STEM_WIDTH = strategy.MIN_STEM_WIDTH || 20;
	var MAX_STEM_WIDTH = strategy.MAX_STEM_WIDTH || 120;
	var MAX_SEGMERGE_DISTANCE = strategy.MAX_SEGMERGE_DISTANCE || 120;
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE || STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT || STEM_SIDE_MIN_DESCENT;

	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;
	var COEFF_A_MULTIPLIER = strategy.COEFF_A_MULTIPLIER || 5;
	var COEFF_A_SAME_RADICAL = strategy.COEFF_A_SAME_RADICAL || 4;
	var COEFF_A_SHAPE_LOST = strategy.COEFF_A_SHAPE_LOST || 25;
	var COEFF_A_FEATURE_LOSS = strategy.COEFF_A_FEATURE_LOSS || 5000;
	var COEFF_A_RADICAL_MERGE = strategy.COEFF_A_RADICAL_MERGE || 1;
	var COEFF_C_MULTIPLIER = strategy.COEFF_C_MULTIPLIER || 25;
	var COEFF_C_SAME_RADICAL = strategy.COEFF_C_SAME_RADICAL || 3;
	var COEFF_S = strategy.COEFF_S || 500;
	var MIN_OVERLAP_RATIO = strategy.MIN_OVERLAP_RATIO || 0.3;
	var MIN_STEM_OVERLAP_RATIO = strategy.MIN_STEM_OVERLAP_RATIO || 0.2;
	var Y_FUZZ = strategy.Y_FUZZ || 7;
	var SLOPE_FUZZ = strategy.SLOPE_FUZZ || 0.04;

	var COLLISION_MIN_OVERLAP_RATIO = strategy.COLLISION_MIN_OVERLAP_RATIO || 0.2;

	function overlapInfo(a, b) {
		var events = []
		for (var j = 0; j < a.length; j++) {
			var low = Math.min(a[j][0].xori, a[j][a[j].length - 1].xori)
			var high = Math.max(a[j][0].xori, a[j][a[j].length - 1].xori)
			events.push({ at: low, on: true, a: true })
			events.push({ at: high, on: false, a: true })
		}
		var probeb = new Array(upm);
		for (var j = 0; j < b.length; j++) {
			var low = Math.min(b[j][0].xori, b[j][b[j].length - 1].xori)
			var high = Math.max(b[j][0].xori, b[j][b[j].length - 1].xori)
			events.push({ at: low, on: true, a: false })
			events.push({ at: high, on: false, a: false })
		}
		events.sort(function (p, q) { return p.at - q.at })
		var len = 0, la = 0, lb = 0;
		var st = 0, sa = 0, sb = 0;
		var ac = 0;
		var bc = 0;
		for (var j = 0; j < events.length; j++) {
			var e = events[j]
			var intersectBefore = ac * bc;
			var ab = ac, bb = bc;
			if (e.a) { if (e.on) ac += 1; else ac -= 1 }
			else { if (e.on) bc += 1; else bc -= 1 }
			if (ac * bc && !intersectBefore) st = e.at;
			if (!(ac * bc) && intersectBefore) len += e.at - st;
			if (ac && !ab) sa = e.at;
			if (!ac && ab) la += e.at - sa;
			if (bc && !bb) sb = e.at;
			if (!bc && bb) lb += e.at - sb;
		};
		return {
			len: len,
			la: la,
			lb: lb
		}
	}

	function overlapRatio(a, b, op) {
		var i = overlapInfo(a, b)
		return op(i.len / i.la, i.len / i.lb)
	}

	function stemOverlapRatio(a, b, op) {
		return Math.max(
			overlapRatio(a.low, b.low, op),
			overlapRatio(a.high, b.low, op),
			overlapRatio(a.low, b.high, op),
			overlapRatio(a.high, b.high, op))
	}
	function stemOverlapLength(a, b) {
		return Math.max(overlapInfo(a.low, b.low).len, overlapInfo(a.high, b.low).len, overlapInfo(a.low, b.high).len, overlapInfo(a.high, b.high).len) / upm
	}

	function atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
	}
	function atGlyphTop(stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
	}
	function atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
	}
	function atGlyphBottom(stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
	};

	function statGlyph(contours) {
		var points = []
		points = points.concat.apply(points, contours.map(function (c) { return c.points }));
		var ys = points.map(function (p) { return p.yori })
		var xs = points.map(function (p) { return p.xori })
		return {
			xmax: Math.max.apply(Math, xs),
			ymax: Math.max.apply(Math, ys),
			xmin: Math.min.apply(Math, xs),
			ymin: Math.min.apply(Math, ys)
		}
	}
	function rootof(radical) {
		if (radical.root === radical) return radical;
		else {
			// Path compression
			var r = rootof(radical.root);
			radical.root = r;
			return r;
		}
	};
	function inclusionToRadicals(inclusions, contours, j, orient) {
		var radicals;
		if (orient) {
			// contours[j] is an inner contour
			// find out radicals inside it
			radicals = [];
			for (var k = 0; k < contours.length; k++) if (inclusions[j][k]) {
				if (contours[k].ccw !== orient) {
					radicals = radicals.concat(inclusionToRadicals(inclusions, contours, k, !orient));
				}
			};
			return radicals
		} else {
			// contours[j] is an outer contour
			// find out its inner contours and radicals inside it
			var radical = { parts: [contours[j]], outline: contours[j], subs: [] };
			radicals = [radical];
			for (var k = 0; k < contours.length; k++) if (inclusions[j][k]) {
				if (contours[k].ccw !== orient) {
					radical.parts.push(contours[k]);
					var inner = inclusionToRadicals(inclusions, contours, k, !orient);
					radical.subs = inner;
					radicals = radicals.concat(inner);
				}
			};
			return radicals
		}
	};
	function transitiveReduce(g) {
		// Floyd-warshall transitive reduction
		for (var x = 0; x < g.length; x++) for (var y = 0; y < g.length; y++) for (var z = 0; z < g.length; z++) {
			if (g[x][y] && g[y][z]) g[x][z] = false;
		}
	}
	function findRadicals(contours) {
		var inclusions = [];
		var radicals = []
		for (var j = 0; j < contours.length; j++) {
			inclusions[j] = [];
			contours[j].outline = true;
		}
		// Find out all inclusion relationships
		for (var j = 0; j < contours.length; j++) {
			for (var k = 0; k < contours.length; k++) {
				if (j !== k && contours[j].includes(contours[k])) {
					inclusions[j][k] = true;
					contours[k].outline = false;
				}
			}
		};
		// Transitive reduction
		transitiveReduce(inclusions);
		// Figure out radicals
		for (var j = 0; j < contours.length; j++) if (contours[j].outline) {
			radicals = radicals.concat(inclusionToRadicals(inclusions, contours, j, contours[j].ccw))
		};
		return radicals;
	};
	var by_start = function (p, q) { return p[0].xori - q[0].xori };
	// Stemfinding
	function findHorizontalSegments(radicals) {
		var segments = []
		for (var r = 0; r < radicals.length; r++) {
			radicals[r].mergedSegments = []
			for (var j = 0; j < radicals[r].parts.length; j++) {
				var contour = radicals[r].parts[j];
				var lastPoint = contour.points[0]
				var segment = [lastPoint];
				segment.radical = r;
				for (var k = 1; k < contour.points.length - 1; k++) if (!contour.points[k].interpolated) {
					if (Math.abs((contour.points[k].yori - lastPoint.yori) / (contour.points[k].xori - lastPoint.xori)) <= SLOPE_FUZZ) {
						segment.push(contour.points[k])
						lastPoint = contour.points[k];
					} else {
						if (segment.length > 1) segments.push(segment)
						lastPoint = contour.points[k];
						segment = [lastPoint]
						segment.radical = r;
					}
				};
				if (Math.abs((contour.points[0].yori - lastPoint.yori) / (contour.points[0].xori - lastPoint.xori)) <= SLOPE_FUZZ) {
					segment.push(contour.points[0])
					segment.push(contour.points[contour.points.length - 1])
				}
				if (segment.length > 1) segments.push(segment)
			}
		}

		segments = segments.sort(function (p, q) { return p[0].xori - q[0].xori })

		for (var j = 0; j < segments.length; j++) if (segments[j]) {
			var pivot = [segments[j]];
			var pivotRadical = segments[j].radical;
			var orientation = pivot[0][1].xori > pivot[0][0].xori
			segments[j] = null;
			for (var k = j + 1; k < segments.length; k++) if (segments[k] && segments[k].radical === pivotRadical) {
				var pendingSegmentLength = Math.abs(segments[k][1].xori - segments[k][0].xori);
				var distanceBetween = orientation ? Math.abs(segments[k][0].xori - pivot[pivot.length - 1][1].xori)
					: Math.abs(segments[k][1].xori - pivot[pivot.length - 1][0].xori);
				if (Math.abs(segments[k][0].yori - pivot[0][0].yori) <= Y_FUZZ
					&& orientation === (segments[k][1].xori > segments[k][0].xori)
					&& (pendingSegmentLength < MAX_STEM_WIDTH
						|| distanceBetween <= pendingSegmentLength && distanceBetween <= MAX_SEGMERGE_DISTANCE)) {
					var r = pivot.radical;
					pivot.push(segments[k])
					segments[k] = null;
				}
			}
			radicals[pivotRadical].mergedSegments.push(pivot.sort(function (s1, s2) {
				return orientation ? s1[0].xori - s2[0].xori : s2[0].xori - s1[0].xori
			}))
		}
	}

	function connectHangingSegments(segs, stem) {
		for (var m = 0; m < segs.length; m++) if (segs[m] && segs[m][0]) {
			var seg = segs[m];
			var stemOverlap = overlapInfo(stem.low, stem.high);
			if ((stem.low[0][1].xori >= stem.low[0][0].xori) === (seg[0][1].xori >= seg[0][0].xori)
				&& Math.abs(seg[0][0].yori - stem.low[0][0].yori) <= Y_FUZZ) {
				var amendedOverlap = overlapInfo(stem.low.concat(seg).sort(by_start), stem.high);
				if (amendedOverlap.len / amendedOverlap.lb > stemOverlap.len / stemOverlap.lb) {
					stem.low = stem.low.concat(seg).sort(by_start);
					segs[m] = null;
				}
			} else if (
				(stem.high[0][1].xori >= stem.high[0][0].xori) === (seg[0][1].xori >= seg[0][0].xori)
				&& Math.abs(seg[0][0].yori - stem.high[0][0].yori) <= Y_FUZZ) {
				var amendedOverlap = overlapInfo(stem.low, stem.high.concat(seg).sort(by_start));
				if (amendedOverlap.len / amendedOverlap.la > stemOverlap.len / stemOverlap.la) {
					stem.high = stem.high.concat(seg).sort(by_start);
					segs[m] = null;
				}
			}
		}
	}

	function pairSegmentsForRadical(radical, r) {
		var radicalStems = [];
		var segs = radical.mergedSegments.sort(function (a, b) { return a[0][0].yori - b[0][0].yori });
		var ori = radical.outline.ccw;
		// We stem segments upward-down.
		for (var j = segs.length - 1; j >= 0; j--) if (segs[j] && ori !== (segs[j][0][0].xori < segs[j][0][segs[j][0].length - 1].xori)) {
			var stem = { high: segs[j] };
			for (var k = j - 1; k >= 0; k--) if (segs[k]) {
				var segOverlap = overlapInfo(segs[j], segs[k]);
				if (segOverlap.len / segOverlap.la >= COLLISION_MIN_OVERLAP_RATIO || segOverlap.len / segOverlap.lb >= COLLISION_MIN_OVERLAP_RATIO) {
					if (ori === (segs[k][0][0].xori < segs[k][0][segs[k][0].length - 1].xori)
						&& segs[j][0][0].yori - segs[k][0][0].yori <= MAX_STEM_WIDTH
						&& segs[j][0][0].yori - segs[k][0][0].yori >= MIN_STEM_WIDTH) {
						// A stem is found
						stem.low = segs[k];
						stem.yori = stem.high[0][0].yori;
						stem.width = Math.abs(stem.high[0][0].yori - stem.low[0][0].yori);
						stem.belongRadical = r;
						segs[j] = segs[k] = null;
						radicalStems.push(stem);
						connectHangingSegments(segs, stem);
					}
					break;
				}
			}
		};
		return radicalStems;
	}

	function pairSegments(radicals) {
		var stems = [];
		for (var r = 0; r < radicals.length; r++) {
			var radicalStems = pairSegmentsForRadical(radicals[r], r);
			stems = stems.concat(radicalStems)
			radicals[r].stems = radicalStems;
		};
		return stems.sort(function (a, b) { return a.yori - b.yori });
	};

	// Symmetric stem pairing
	function pairSymmetricStems(stems) {
		var res = [];
		for (var j = 0; j < stems.length; j++) {
			for (var k = j + 1; k < stems.length; k++) if (stems[j] && stems[k]) {
				var delta1 = stems[j].belongRadical === stems[k].belongRadical ? 0.002 : 0.005;
				var delta2 = stems[j].belongRadical === stems[k].belongRadical ? 0.001 : 0.003;
				if (
					Math.abs(stems[j].yori - stems[j].width / 2 - stems[k].yori + stems[k].width / 2) <= upm * delta1 && Math.abs(stems[j].width - stems[k].width) <= upm * delta1
				) {
					stems[j].high = stems[j].high.concat(stems[k].high);
					stems[j].low = stems[j].low.concat(stems[k].low);
					stems[k] = null
				}
			}
		};
		for (var j = 0; j < stems.length; j++) if (stems[j]) {
			res.push(stems[j])
		};
		return res;
	};

	// Spatial relationship analyzation
	function analyzePointToStemSpatialRelationships(stem) {
		var a0 = stem.low[0][0].xori, az = stem.low[stem.low.length - 1][stem.low[stem.low.length - 1].length - 1].xori;
		var b0 = stem.high[0][0].xori, bz = stem.high[stem.high.length - 1][stem.high[stem.high.length - 1].length - 1].xori;
		var xmin = Math.min(a0, b0, az, bz), xmax = Math.max(a0, b0, az, bz);
		for (var rad = 0; rad < glyph.radicals.length; rad++) {
			var radical = glyph.radicals[rad];
			var sameRadical = (radical === glyph.radicals[stem.belongRadical]);
			for (var j = 0; j < radical.parts.length; j++) for (var k = 0; k < radical.parts[j].points.length - 1; k++) {
				var point = radical.parts[j].points[k];
				if (point.yori > stem.yori && point.xori < xmax - blueFuzz && point.xori > xmin + blueFuzz) {
					stem.hasGlyphPointAbove = true;
					stem.glyphCenterRise = Math.max(stem.glyphCenterRise || 0, point.yori - stem.yori);
					if (sameRadical) {
						stem.hasRadicalPointAbove = true;
						stem.radicalCenterRise = Math.max(stem.radicalCenterRise || 0, point.yori - stem.yori);
					}
				}
				if (point.yori > stem.yori && point.xori >= xmax - blueFuzz && point.xori <= xmax + blueFuzz) {
					stem.hasGlyphRightAdjacentPointAbove = true;
					stem.glyphRightAdjacentRise = Math.max(stem.glyphRightAdjacentRise || 0, point.yori - stem.yori);
					if (sameRadical) {
						stem.hasRadicalRightAdjacentPointAbove = true;
						stem.radicalRightAdjacentRise = Math.max(stem.radicalRightAdjacentRise || 0, point.yori - stem.yori);
					}
				}
				if (point.yori > stem.yori && point.xori <= xmin + blueFuzz && point.xori >= xmin - blueFuzz) {
					stem.hasGlyphLeftAdjacentPointAbove = true;
					stem.glyphLeftAdjacentRise = Math.max(stem.glyphLeftAdjacentRise || 0, point.yori - stem.yori);
					if (sameRadical) {
						stem.hasRadicalLeftAdjacentPointAbove = true;
						stem.radicalLeftAdjacentRise = Math.max(stem.radicalLeftAdjacentRise || 0, point.yori - stem.yori);
					}
				}
				if (point.yori > stem.yori && point.xori >= xmax + blueFuzz) {
					stem.hasGlyphRightDistancedPointAbove = true;
					stem.glyphRightDistancedRise = Math.max(stem.glyphRightDistancedRise || 0, point.yori - stem.yori);
					if (sameRadical) {
						stem.hasRadicalRightDistancedPointAbove = true;
						stem.radicalRightDistancedRise = Math.max(stem.radicalRightDistancedRise || 0, point.yori - stem.yori);
					}
				}
				if (point.yori > stem.yori && point.xori <= xmin - blueFuzz) {
					stem.hasGlyphLeftDistancedPointAbove = true;
					stem.glyphLeftDistancedRise = Math.max(stem.glyphLeftDistancedRise || 0, point.yori - stem.yori);
					if (sameRadical) {
						stem.hasRadicalLeftDistancedPointAbove = true;
						stem.radicalLeftDistancedRise = Math.max(stem.radicalLeftDistancedRise || 0, point.yori - stem.yori);
					}
				}
				if (point.yori < stem.yori - stem.width && point.xori < xmax - blueFuzz && point.xori > xmin + blueFuzz) {
					stem.hasGlyphPointBelow = true;
					stem.glyphCenterDescent = Math.max(stem.glyphCenterDescent || 0, stem.yori - stem.width - point.yori);
					if (sameRadical) {
						stem.hasRadicalPointBelow = true;
						stem.radicalCenterDescent = Math.max(stem.radicalCenterDescent || 0, stem.yori - stem.width - point.yori);
					}
					if (point.yStrongExtrema) {
						stem.hasGlyphVFoldBelow = true;
						if (sameRadical) { stem.hasRadicalVFoldBelow = true }
					}
				}
				if (point.xStrongExtrema && point.yori < stem.yori - stem.width - blueFuzz && point.xori < xmax + stem.width && point.xori > xmin - stem.width) {
					if (!point.atleft && point.xori > xmin + (xmax - xmin) * 0.2 || point.atleft && point.xori < xmax - (xmax - xmin) * 0.2) {
						stem.hasGlyphFoldBelow = true;
						if (sameRadical) { stem.hasRadicalFoldBelow = true }
					} else {
						stem.hasGlyphSideFoldBelow = true;
						if (sameRadical) { stem.hasRadicalSideFoldBelow = true }
					}
				}
				if (point.yori < stem.yori - stem.width && point.xori >= xmax - blueFuzz && point.xori <= xmax + blueFuzz) {
					stem.hasGlyphRightAdjacentPointBelow = true;
					stem.glyphRightAdjacentDescent = Math.max(stem.glyphRightAdjacentDescent || 0, stem.yori - stem.width - point.yori);
					if (sameRadical) {
						stem.hasRadicalRightAdjacentPointBelow = true;
						stem.radicalRightAdjacentDescent = Math.max(stem.radicalRightAdjacentDescent || 0, stem.yori - stem.width - point.yori);
					}
				}
				if (point.yori < stem.yori - stem.width && point.xori <= xmin + blueFuzz && point.xori >= xmin - blueFuzz) {
					stem.hasGlyphLeftAdjacentPointBelow = true;
					stem.glyphLeftAdjacentDescent = Math.max(stem.glyphLeftAdjacentDescent || 0, stem.yori - stem.width - point.yori);
					if (sameRadical) {
						stem.hasRadicalLeftAdjacentPointBelow = true;
						stem.radicalLeftAdjacentDescent = Math.max(stem.radicalLeftAdjacentDescent || 0, stem.yori - stem.width - point.yori);
					}
				}
				if (point.yori < stem.yori - stem.width && point.xori >= xmax + blueFuzz) {
					stem.hasGlyphRightDistancedPointBelow = true;
					stem.glyphRightDistancedDescent = Math.max(stem.glyphRightDistancedDescent || 0, stem.yori - stem.width - point.yori);
					if (sameRadical) {
						stem.hasRadicalRightDistancedPointBelow = true;
						stem.radicalRightDistancedDescent = Math.max(stem.radicalRightDistancedDescent || 0, stem.yori - stem.width - point.yori);
					}
				}
				if (point.yori < stem.yori - stem.width && point.xori <= xmin - blueFuzz) {
					stem.hasGlyphLeftDistancedPointBelow = true;
					stem.glyphLeftDistancedDescent = Math.max(stem.glyphLeftDistancedDescent || 0, stem.yori - stem.width - point.yori);
					if (sameRadical) {
						stem.hasRadicalLeftDistancedPointBelow = true;
						stem.radicalLeftDistancedDescent = Math.max(stem.radicalLeftDistancedDescent || 0, stem.yori - stem.width - point.yori);
					}
				}
			}
		}
		stem.xmin = xmin;
		stem.xmax = xmax;
	};
	function analyzePointBetweenStems(stems) {
		var res = [];
		for (var sj = 0; sj < stems.length; sj++) {
			res[sj] = [];
			for (var sk = 0; sk < sj; sk++) {
				res[sj][sk] = false;
				for (var rad = 0; rad < glyph.radicals.length; rad++) {
					var radical = glyph.radicals[rad];
					for (var j = 0; j < radical.parts.length; j++) for (var k = 0; k < radical.parts[j].points.length - 1; k++) {
						var point = radical.parts[j].points[k];
						if (point.yori > stems[sk].yori && point.yori < stems[sj].yori - stems[sj].width
							&& point.xori > stems[sk].xmin + blueFuzz && point.xori < stems[sk].xmax - blueFuzz
							&& point.xori > stems[sj].xmin + blueFuzz && point.xori < stems[sj].xmax - blueFuzz) {
							res[sj][sk] = true;
						}
					}
				}
			}
		};
		return res;
	};
	function analyzeStemSpatialRelationships(stems, overlaps) {
		for (var k = 0; k < stems.length; k++) {
			analyzePointToStemSpatialRelationships(stems[k], stems[k].belongRadical);
			for (var j = 0; j < stems.length; j++) {
				if (overlaps[j][k] > COLLISION_MIN_OVERLAP_RATIO && stems[j].yori > stems[k].yori) {
					stems[k].hasGlyphStemAbove = true;
					stems[j].hasGlyphStemBelow = true;
					if (stems[j].belongRadical === stems[k].belongRadical) {
						stems[j].hasSameRadicalStemBelow = true;
						stems[k].hasSameRadicalStemAbove = true;
					}
				}
			}
		}
	};
	function adjacent(z1, z2) {
		return z1.prev === z2 || z2.prev === z1;
	}
	function segmentsPromixity(s1, s2) {
		var count = 0;
		for (var j = 0; j < s1.length; j++) for (var k = 0; k < s2.length; k++) {
			if (adjacent(s1[j][0], s2[k][0])) count += 1;
			if (adjacent(s1[j][0], s2[k][1])) count += 1;
			if (adjacent(s1[j][1], s2[k][0])) count += 1;
			if (adjacent(s1[j][1], s2[k][1])) count += 1;
		}
		return count;
	}
	// Collision matrices, used to calculate collision potential
	function calculateCollisionMatrices(stems, overlaps, overlapLengths, pbs) {
		// A : Alignment operator
		// C : Collision operator
		// S : Swap operator
		var A = [], C = [], S = [], n = stems.length;
		for (var j = 0; j < n; j++) {
			A[j] = [];
			C[j] = [];
			S[j] = [];
			for (var k = 0; k < n; k++) {
				A[j][k] = C[j][k] = S[j][k] = 0
			}
		};
		for (var j = 0; j < n; j++) {
			for (var k = 0; k < j; k++) {
				var ovr = overlaps[j][k] * overlapLengths[j][k];
				var coeffA = 1;
				var promixity = segmentsPromixity(stems[j].low, stems[k].high) + segmentsPromixity(stems[j].high, stems[k].low);
				if (pbs[j][k]) {
					coeffA = COEFF_A_FEATURE_LOSS
				} else if (stems[j].belongRadical === stems[k].belongRadical) {
					if (!stems[j].hasSameRadicalStemAbove || !stems[k].hasSameRadicalStemBelow) {
						coeffA = COEFF_A_SHAPE_LOST
					} else {
						coeffA = COEFF_A_SAME_RADICAL
					}
				} else {
					if (atRadicalBottom(stems[j]) && atRadicalTop(stems[k])) coeffA = COEFF_A_RADICAL_MERGE
				}
				A[j][k] = COEFF_A_MULTIPLIER * ovr * coeffA * (1 + (promixity > 2 ? COEFF_C_MULTIPLIER / COEFF_A_MULTIPLIER : 1) * promixity);

				var coeffC = 1;
				if (stems[j].belongRadical === stems[k].belongRadical) coeffC = COEFF_C_SAME_RADICAL;
				C[j][k] = COEFF_C_MULTIPLIER * ovr * coeffC * (1 + (promixity > 2 ? COEFF_C_MULTIPLIER / COEFF_A_MULTIPLIER : 1) * promixity);

				S[j][k] = COEFF_S;
			};
		};
		return {
			alignment: A,
			collision: C,
			swap: S
		}
	};


	var radicals = glyph.radicals = findRadicals(glyph.contours);
	var stats = glyph.stats = statGlyph(glyph.contours);
	findHorizontalSegments(radicals);
	var stems = pairSegments(radicals);
	stems = pairSymmetricStems(stems);

	var OP_MIN = Math.min;
	var OP_MAX = Math.max;

	function OverlapMatrix(fn) {
		var transitions = [];
		for (var j = 0; j < stems.length; j++) {
			transitions[j] = []
			for (var k = 0; k < stems.length; k++) {
				transitions[j][k] = fn(stems[j], stems[k])
			}
		};
		return transitions
	}

	var overlaps = OverlapMatrix(function (p, q) { return stemOverlapRatio(p, q, OP_MIN) });
	glyph.stemOverlaps = OverlapMatrix(function (p, q) { return stemOverlapRatio(p, q, OP_MAX) });
	var overlapLengths = glyph.stemOverlapLengths = OverlapMatrix(function (p, q) { return stemOverlapLength(p, q, OP_MIN) })
	analyzeStemSpatialRelationships(stems, overlaps);
	var pointBetweenStems = analyzePointBetweenStems(stems);
	glyph.collisionMatrices = calculateCollisionMatrices(stems, overlaps, overlapLengths, pointBetweenStems);
	glyph.stems = stems;
	return glyph;
}

exports.findStems = findStems;
},{}],7:[function(require,module,exports){
// THIS IS XUANXUE


var util = require('util');
var roundings = require('./roundings');

function proportion(p, q) { return p / (p + q) }
function clamp(x) { return Math.min(1, Math.max(0, x)) }
function xclamp(low, x, high) { return x < low ? low : x > high ? high : x }
function mix(a, b, x) { return a + (b - a) * x }
function aggerate(p, gamma) {
	if (p <= 0.5) {
		return mix(0.5, 0, Math.pow((0.5 - p) * 2, gamma))
	} else {
		return mix(0.5, 1, Math.pow((p - 0.5) * 2, gamma))
	}
}

function hint(glyph, ppem, strategy) {
	var upm = strategy.UPM || 1000;

	var MIN_STEM_WIDTH = strategy.MIN_STEM_WIDTH;
	var MAX_STEM_WIDTH = strategy.MAX_STEM_WIDTH;
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_SIDE_MIN_DIST_RISE = strategy.STEM_SIDE_MIN_DIST_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE || STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_SIDE_MIN_DIST_DESCENT = strategy.STEM_SIDE_MIN_DIST_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT || STEM_SIDE_MIN_DESCENT;

	var POPULATION_LIMIT = strategy.POPULATION_LIMIT || 200;
	var CHILDREN_LIMIT = strategy.CHILDREN_LIMIT || 100;
	var EVOLUTION_STAGES = strategy.EVOLUTION_STAGES || 15;
	var MUTANT_PROBABLITY = strategy.MUTANT_PROBABLITY || 0.4;
	var ELITE_COUNT = strategy.ELITE_COUNT || 10;
	var PPEM_INCREASE_GLYPH_LIMIT = strategy.PPEM_INCREASE_GLYPH_LIMIT || 20;


	var REBALANCE_PASSES = strategy.REBALANCE_PASSES || 1;
	var WIDTH_ALLOCATION_PASSES = strategy.WIDTH_ALLOCATION_PASSES || 5;

	var COEFF_DISTORT = strategy.COEFF_DISTORT || 10;

	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;

	var COLLISION_MIN_OVERLAP_RATIO = strategy.COLLISION_MIN_OVERLAP_RATIO || 0.2;

	var PPEM_STEM_WIDTH_GEARS = strategy.PPEM_STEM_WIDTH_GEARS || [[0, 1, 1], [13, 1, 2], [21, 2, 2], [27, 2, 3], [32, 3, 3]];
	var WIDTH_GEAR_PROPER, WIDTH_GEAR_MIN;
	for (var j = 0; j < PPEM_STEM_WIDTH_GEARS.length; j++) {
		WIDTH_GEAR_PROPER = PPEM_STEM_WIDTH_GEARS[j][1];
		if (j + 1 < PPEM_STEM_WIDTH_GEARS.length && PPEM_STEM_WIDTH_GEARS[j][0] <= ppem && PPEM_STEM_WIDTH_GEARS[j + 1][0] > ppem) {
			WIDTH_GEAR_MIN = PPEM_STEM_WIDTH_GEARS[j][2];
			break;
		};
		if (j === PPEM_STEM_WIDTH_GEARS.length - 1) {
			WIDTH_GEAR_MIN = PPEM_STEM_WIDTH_GEARS[j][2]
		}
	};

	var ABLATION_IN_RADICAL = strategy.ABLATION_IN_RADICAL || 1;
	var ABLATION_RADICAL_EDGE = strategy.ABLATION_RADICAL_EDGE || 2;
	var ABLATION_GLYPH_EDGE = strategy.ABLATION_GLYPH_EDGE || 15;
	var ABLATION_GLYPH_HARD_EDGE = strategy.ABLATION_GLYPH_HARD_EDGE || 25;

	var COEFF_PORPORTION_DISTORTION = strategy.COEFF_PORPORTION_DISTORTION || 4;

	var BLUEZONE_BOTTOM_CENTER = strategy.BLUEZONE_BOTTOM_CENTER || -75;
	var BLUEZONE_TOP_CENTER = strategy.BLUEZONE_TOP_CENTER || 840;
	var BLUEZONE_BOTTOM_LIMIT = strategy.BLUEZONE_BOTTOM_LIMIT || -65;
	var BLUEZONE_TOP_LIMIT = strategy.BLUEZONE_TOP_LIMIT || 825;
	var BLUEZONE_BOTTOM_BAR = strategy.BLUEZONE_BOTTOM_BAR || -65;
	var BLUEZONE_TOP_BAR = strategy.BLUEZONE_TOP_BAR || 825;
	var BLUEZONE_BOTTOM_DOTBAR = strategy.BLUEZONE_BOTTOM_DOTBAR || BLUEZONE_BOTTOM_BAR;
	var BLUEZONE_TOP_DOTBAR = strategy.BLUEZONE_TOP_DOTBAR || BLUEZONE_TOP_BAR;

	var MOST_COMMON_STEM_WIDTH = strategy.MOST_COMMON_STEM_WIDTH || 65;

	var DONT_ADJUST_STEM_WIDTH = strategy.DONT_ADJUST_STEM_WIDTH || false;


	var shouldAddGlyphHeight = strategy.shouldAddGlyphHeight || function (stem, ppem, pixelTop, pixelBottom) {
		return stem.yori - stem.ytouch >= 0.25 * uppx
	}

	function byyori(a, b) {
		return a.yori - b.yori
	}
	var stems = glyph.stems.sort(byyori);

	var round = roundings.Rtg(upm, ppem);
	var roundDown = roundings.Rdtg(upm, ppem);
	var roundUp = roundings.Rutg(upm, ppem);

	var uppx = upm / ppem;
	var pixelBottom = round(BLUEZONE_BOTTOM_CENTER);
	var oPixelTop = round(BLUEZONE_TOP_CENTER);
	var pixelTop = pixelBottom + round(BLUEZONE_TOP_CENTER - BLUEZONE_BOTTOM_CENTER);
	var glyfBottom = pixelBottom;
	var glyfTop = pixelTop;

	function roundDownStem(stem) {
		stem.roundMethod = -1; // Positive for round up, negative for round down
		stem.ytouch = roundDown(stem.yori);
		stem.deltaY = 0
	}
	function roundUpStem(stem) {
		stem.roundMethod = 1;
		stem.ytouch = roundUp(stem.yori);
		stem.deltaY = 0
	}

	function calculateWidth(w) {
		return Math.round(Math.max(WIDTH_GEAR_MIN, Math.min(WIDTH_GEAR_PROPER, w / MOST_COMMON_STEM_WIDTH * WIDTH_GEAR_PROPER))) * uppx
	}

	function atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > STEM_SIDE_MIN_DIST_RISE)
			&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > STEM_SIDE_MIN_DIST_RISE)
	}
	function atGlyphTop(stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
			&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > STEM_SIDE_MIN_RISE)
	}
	function atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT)
			&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > STEM_SIDE_MIN_DIST_DESCENT)
	};
	function atGlyphBottom(stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
			&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
	};

	var directOverlaps = glyph.directOverlaps;
	var overlaps = glyph.overlaps;
	var triplets = glyph.triplets;
	var flexes = glyph.flexes;

	var cyb = pixelBottom
		+ (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_BOTTOM_DOTBAR - BLUEZONE_BOTTOM_CENTER));
	var cyt = pixelTop
		- (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_DOTBAR));
	var cybx = pixelBottom
		+ (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_BOTTOM_BAR - BLUEZONE_BOTTOM_CENTER))
		+ Math.min(0, ppem <= PPEM_INCREASE_GLYPH_LIMIT ? pixelBottom - BLUEZONE_BOTTOM_BAR : pixelBottom - BLUEZONE_BOTTOM_CENTER);
	var cytx = pixelTop
		- (ppem <= PPEM_INCREASE_GLYPH_LIMIT ? 0 : roundDown(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR))
		+ Math.max(0, ppem <= PPEM_INCREASE_GLYPH_LIMIT ? oPixelTop - BLUEZONE_TOP_BAR : oPixelTop - BLUEZONE_TOP_CENTER);

	function cy(y, w0, w, x) {
		// x means this stroke is topmost or bottommost
		var p = (y - w0 - BLUEZONE_BOTTOM_BAR) / (BLUEZONE_TOP_BAR - BLUEZONE_BOTTOM_BAR - w0);
		if (x) {
			return w + cybx + (cytx - cybx - w) * p;
		} else {
			return w + cyb + (cyt - cyb - w) * p;
		}
	}
	function flexMiddleStem(t, m, b) {
		var spaceAboveOri = t.y0 - t.w0 / 2 - m.y0 + m.w0 / 2
		var spaceBelowOri = m.y0 - m.w0 / 2 - b.y0 + b.w0 / 2
		if (spaceAboveOri + spaceBelowOri > 0) {
			var totalSpaceFlexed = t.center - t.properWidth / 2 - b.center + b.properWidth / 2;
			var y = m.properWidth / 2 + b.center - b.properWidth / 2 + totalSpaceFlexed * (spaceBelowOri / (spaceBelowOri + spaceAboveOri));
			m.center = xclamp(m.low * uppx, y, m.high * uppx)
		}
	}

	function flexCenter(avaliables) {
		// fix top and bottom stems
		for (var j = 0; j < stems.length; j++) {
			if (!stems[j].hasGlyphStemBelow) {
				avaliables[j].high = Math.round(Math.max(avaliables[j].center, pixelBottom + avaliables[j].properWidth + (atGlyphBottom(stems[j]) ? 0 : uppx)) / uppx);
			};
			if (!stems[j].hasGlyphStemAbove) {
				avaliables[j].low = Math.round(avaliables[j].center / uppx);
			};
		}
		for (var j = 0; j < flexes.length; j++) {
			flexMiddleStem(avaliables[flexes[j][0]], avaliables[flexes[j][1]], avaliables[flexes[j][2]]);
		}
	};
	var avaliables = function (stems) {
		var avaliables = []
		for (var j = 0; j < stems.length; j++) {
			var y0 = stems[j].yori, w0 = stems[j].width;
			var w = calculateWidth(w0);

			// The bottom limit of a stem
			var lowlimit = atGlyphBottom(stems[j])
				? pixelBottom + WIDTH_GEAR_MIN * uppx
				: pixelBottom + WIDTH_GEAR_MIN * uppx + uppx;

			// Add additional space below strokes with a fold under it.
			if (stems[j].hasGlyphFoldBelow && !stems[j].hasGlyphStemBelow) {
				lowlimit = Math.max(pixelBottom + Math.max(WIDTH_GEAR_MIN + 2, WIDTH_GEAR_MIN > 2 ? WIDTH_GEAR_MIN * 2 : WIDTH_GEAR_MIN * 2 + 1) * uppx, lowlimit);
			} else if (stems[j].hasGlyphSideFoldBelow && !stems[j].hasGlyphStemBelow) {
				lowlimit = Math.max(pixelBottom + Math.max(WIDTH_GEAR_MIN + 2, WIDTH_GEAR_MIN * 2) * uppx, lowlimit);
			}

			// The top limit of a stem ('s upper edge)
			var highlimit = ppem <= PPEM_INCREASE_GLYPH_LIMIT // small sizes
				? pixelTop - (atGlyphTop(stems[j]) ? 0 : uppx) // leave 0px for top stroke, 1 for non-top
				: pixelTop - xclamp( // for larger size, consider BLUEZONE_TOP_BAR's value
					atGlyphTop(stems[j]) ? 0 : uppx,
					atGlyphTop(stems[j])
						? round(BLUEZONE_TOP_CENTER - BLUEZONE_TOP_BAR) + roundDown(BLUEZONE_TOP_BAR - y0)
						: round(BLUEZONE_TOP_CENTER - y0),
					WIDTH_GEAR_MIN * uppx);

			var center0 = cy(y0, w0, w, atGlyphTop(stems[j]) || atGlyphBottom(stems[j]));
			var low = xclamp(lowlimit, round(center0) - uppx, highlimit);
			var high = xclamp(lowlimit, round(center0) + uppx, highlimit);
			var center = xclamp(low, center0, high);

			var ablationCoeff = atGlyphTop(stems[j]) || atGlyphBottom(stems[j]) ? ABLATION_GLYPH_HARD_EDGE
				: !stems[j].hasGlyphStemAbove || !stems[j].hasGlyphStemBelow ? ABLATION_GLYPH_EDGE
					: !stems[j].hasSameRadicalStemAbove || !stems[j].hasSameRadicalStemBelow ? ABLATION_RADICAL_EDGE : ABLATION_IN_RADICAL;
			avaliables[j] = {
				low: Math.round(low / uppx),
				high: Math.round(high / uppx),
				properWidth: w,
				center: center,
				ablationCoeff: ablationCoeff / uppx * (1 + 0.5 * (stems[j].xmax - stems[j].xmin) / upm),
				y0: y0,
				w0: w0
			};
		};
		flexCenter(avaliables);
		for (var j = 0; j < stems.length; j++) {
			avaliables[j].proportion = (avaliables[j].center - avaliables[0].center) / (avaliables[avaliables.length - 1].center - avaliables[0].center) || 0
		};
		return avaliables;
	} (stems);

	var COLLISION_FUZZ = 1.04;
	var HIGHLY_COLLISION_FUZZ = 0.3;

	function canBeAdjustedUp(stems, k, distance) {
		for (var j = k + 1; j < stems.length; j++) {
			if (directOverlaps[j][k] && (stems[j].ytouch - stems[k].ytouch) - stems[j].touchwidth <= distance)
				return false
		}
		return true;
	}
	function canBeAdjustedDown(stems, k, distance) {
		for (var j = 0; j < k; j++) {
			if (directOverlaps[k][j] && (stems[k].ytouch - stems[j].ytouch) - stems[k].touchwidth <= distance)
				return false
		}
		return true;
	}

	// Pass 1. Early Uncollide
	// In this pass we move stems to avoid collisions between them.
	// This pass is deterministic, and its result will be used as the seed in the next
	// pass.
	function earlyAllocate(y, j, allocated) {
		var ymax = -999;
		// Find the high point of stems below stem j
		for (var k = 0; k < j; k++) if (directOverlaps[j][k] && y[k] > ymax) {
			ymax = y[k];
		};
		var c = round(avaliables[j].center) / uppx
		if (avaliables[j].low >= ymax + 2) {
			y[j] = avaliables[j].low;
		} else if (c >= ymax + 2) {
			y[j] = c
		} else if (avaliables[j].high >= ymax + 2) {
			// Place upward
			y[j] = xclamp(avaliables[j].low, ymax + 2, avaliables[j].high)
		} else if (avaliables[j].low <= ymax && avaliables[j].high >= ymax) {
			// merge
			y[j] = ymax;
		} else {
			y[j] = xclamp(avaliables[j].low, c, avaliables[j].high);
		};
		allocated[j] = true;
		for (var k = j + 1; k < stems.length; k++) if (!allocated[k]) earlyAllocate(y, k, allocated);
	}
	function earlyAdjust(stems) {
		var y0 = [];
		var allocated = [];
		earlyAllocate(y0, 0, allocated);
		for (var j = 0; j < stems.length; j++) {
			stems[j].ytouch = y0[j] * uppx;
			stems[j].touchwidth = uppx;
		};
	};
	// Pass 2 : Uncollide
	// In this pass a genetic algorithm take place to optimize stroke placements of the glyph.
	// The optimization target is the "collision potential" evaluated using stroke position
	// state vector |y>. Due to randomized mutations, the result is not deterministic, though
	// reliable under most cases.
	function collidePotential(y, A, C, S, avaliables) {
		var p = 0;
		var n = y.length;
		for (var j = 0; j < n; j++) {
			for (var k = 0; k < j; k++) {
				if (y[j] === y[k]) p += A[j][k];
				else if (y[j] === y[k] + 1 || y[j] + 1 === y[k]) p += C[j][k];
				if (y[j] < y[k] || Math.abs(avaliables[j].center - avaliables[k].center) < 4 && y[j] !== y[k]) p += S[j][k];
			};
		};
		for (var t = 0; t < triplets.length; t++) {
			var j = triplets[t][0], k = triplets[t][1], w = triplets[t][2], d = triplets[t][3];
			var spacejk = y[j] - y[k] - avaliables[j].properWidth / uppx;
			var spacekw = y[k] - y[w] - avaliables[k].properWidth / uppx;
			//if(spacejk <= 0 || spacekw <= 0) p += COEFF_DISTORT;
			if (y[j] > y[k] && y[k] > y[w] && (
				d >= blueFuzz && spacejk < spacekw
				|| d <= -blueFuzz && spacejk > spacekw
				|| d < blueFuzz && d > -blueFuzz && (spacejk - spacekw > 1 || spacejk - spacekw < -1))) {
				p += (C[j][k] + C[k][w]) * COEFF_DISTORT;
			}
		};
		return p;
	};
	function ablationPotential(y, A, C, S, avaliables) {
		var p = 0;
		var n = y.length;
		var ymin = ppem, ymax = -ppem;
		for (var j = 0; j < n; j++) {
			if (y[j] > ymax) ymax = y[j];
			if (y[j] < ymin) ymin = y[j];
		}
		var ymaxt = Math.max(ymax, glyfTop);
		var ymint = Math.min(ymin, glyfBottom);
		for (var j = 0; j < y.length; j++) {
			p += avaliables[j].ablationCoeff * Math.abs(y[j] * uppx - avaliables[j].center)
			p += COEFF_PORPORTION_DISTORTION * Math.abs(y[j] - (ymin + avaliables[j].proportion * (ymax - ymin)))
		};
		return p;
	};

	function Individual(y) {
		this.gene = y;
		this.collidePotential = collidePotential(y, glyph.collisionMatrices.alignment, glyph.collisionMatrices.collision, glyph.collisionMatrices.swap, avaliables);
		this.ablationPotential = ablationPotential(y, glyph.collisionMatrices.alignment, glyph.collisionMatrices.collision, glyph.collisionMatrices.swap, avaliables);
		this.fitness = 1 / (1 + Math.max(0, this.collidePotential * 8 + this.ablationPotential / 16))
	};
	var beta = 1;
	var CR = 0.5;
	function crossover(p, q, r) {
		var n = p.gene.length;
		var newgene = new Array(n);
		var R = Math.random() * n | 0;
		for (var j = 0; j < p.gene.length; j++) {
			if ((Math.random() * n | 0) === R || Math.random() < CR) {
				newgene[j] = xclamp(avaliables[j].low, p.gene[j] + beta * (q.gene[j] - r.gene[j]), avaliables[j].high)
			} else {
				newgene[j] = p.gene[j];
			}
		}
		return new Individual(newgene);
	};
	// Use a swapchain to avoid re-allochain
	function evolve(p, q, odd) {
		var population = odd ? p : q;
		var background = odd ? q : p;
		// Crossover
		for (var c = 0; c < population.length; c++) {
			var original = population[c];
			var m1 = population[0 | Math.random() * population.length];
			var m2 = population[0 | Math.random() * population.length];
			var candidate = crossover(original, m1, m2);
			background[c] = candidate.fitness > original.fitness ? candidate : original;
		};
		return population;
	};
	function uncollide(stems, multiplier) {
		if (!stems.length) return;

		var n = stems.length;
		var y0 = stems.map(function (s, j) { return xclamp(avaliables[j].low, Math.round(stems[j].ytouch / uppx), avaliables[j].high) });

		var population = [new Individual(y0)];
		// Generate initial population
		for (var j = 0; j < n; j++) {
			for (var k = avaliables[j].low; k <= avaliables[j].high; k++) if (k !== y0[j]) {
				var y1 = y0.slice(0);
				y1[j] = k;
				population.push(new Individual(y1));
			};
		};
		population.push(new Individual(y0.map(function (y, j) {
			return xclamp(avaliables[j].low, y - 1, avaliables[j].high)
		})));
		population.push(new Individual(y0.map(function (y, j) {
			return xclamp(avaliables[j].low, y + 1, avaliables[j].high)
		})));

		for (var c = population.length; c < POPULATION_LIMIT; c++) {
			// fill population with random individuals
			var ry = new Array(n);
			for (var j = 0; j < n; j++) {
				ry[j] = xclamp(avaliables[j].low, Math.floor(avaliables[j].low + Math.random() * (avaliables[j].high - avaliables[j].low + 1)), avaliables[j].high);
			}
			population.push(new Individual(ry));
		}

		var elites = [new Individual(y0)];
		var totalStages = Math.max(EVOLUTION_STAGES, Math.ceil(stems.length * EVOLUTION_STAGES * (multiplier || 1) * (stems.length / ppem)));
		// Build a swapchain
		var p = population, q = new Array(population.length);
		for (var s = 0; s < totalStages; s++) {
			population = evolve(p, q, !(s % 2));
			var elite = population[0];
			for (var j = 0; j < population.length; j++) if (population[j].fitness > elite.fitness) {
				elite = population[j];
			}
			elites.push(elite);
			if (elite.collidePotential <= 0) break;
		};

		population = elites.concat(population);
		var best = population[0];
		for (var j = 1; j < population.length; j++) if (population[j].fitness > best.fitness) {
			best = population[j];
		}
		// Assign
		for (var j = 0; j < stems.length; j++) {
			stems[j].ytouch = best.gene[j] * uppx;
			stems[j].touchwidth = uppx;
			stems[j].roundMethod = stems[j].ytouch >= stems[j].yori ? 1 : -1;
		};
	};

	// Pass 3 : Rebalance
	function rebalance(stems) {
		var m = stems.map(function (s, j) { return [s.xmax - s.xmin, j] }).sort(function (a, b) { return b[0] - a[0] });
		for (var pass = 0; pass < REBALANCE_PASSES; pass++) for (var jm = 0; jm < m.length; jm++) {
			var j = m[jm][1];
			if (!atGlyphTop(stems[j]) && !atGlyphBottom(stems[j])) {
				if (canBeAdjustedDown(stems, j, 1.8 * uppx) && stems[j].ytouch > avaliables[j].low * uppx) {
					if (stems[j].ytouch - avaliables[j].center > 0.6 * uppx) {
						stems[j].ytouch -= uppx
					}
				} else if (canBeAdjustedUp(stems, j, 1.8 * uppx) && stems[j].ytouch < avaliables[j].high * uppx) {
					if (avaliables[j].center - stems[j].ytouch > 0.6 * uppx) {
						stems[j].ytouch += uppx;
					}
				};
			};
		}
	};
	function edgetouch(s, t) {
		return (s.xmin < t.xmin && t.xmin < s.xmax && s.xmax < t.xmax && (s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.26)
			|| (t.xmin < s.xmin && s.xmin < t.xmax && t.xmax < s.xmax && (t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.26)
	};
	function cover(s, t) {
		return (t.xmin > mix(s.xmin, s.xmax, 0.1) && t.xmax < mix(s.xmin, s.xmax, 0.9))
	}
	// Pass 4 : Width allocation
	function spaceBelow(y, w, k, bottom) {
		var space = y[k] - w[k] - bottom;
		for (var j = k - 1; j >= 0; j--) {
			if (directOverlaps[k][j] && Math.abs(y[k] - y[j]) - w[k] < space)
				space = y[k] - y[j] - w[k]
		}
		return space;
	}
	function spaceAbove(y, w, k, top) {
		var space = top - y[k];
		for (var j = k + 1; j < stems.length; j++) {
			if (directOverlaps[j][k] && Math.abs(y[j] - y[k]) - w[j] < space)
				space = y[j] - y[k] - w[j]
		}
		return space;
	}
	function allocateWidth(stems) {
		var allocated = [];
		var y = [];
		var w = [];
		var properWidths = [];
		for (var j = 0; j < stems.length; j++) {
			properWidths[j] = Math.round(calculateWidth(stems[j].width) / uppx)
			y[j] = Math.round(stems[j].ytouch / uppx)
			w[j] = 1
		};

		var pixelTopPixels = Math.round(pixelTop / uppx);
		var pixelBottomPixels = Math.round(pixelBottom / uppx);

		function allocateDown(j) {
			var sb = spaceBelow(y, w, j, pixelBottomPixels - 1);
			var wr = properWidths[j];
			var wx = Math.min(wr, w[j] + sb - 1);
			if (wx <= 1) return;
			if (sb + w[j] >= wr + 1 && y[j] - wr >= pixelBottomPixels + (stems[j].hasGlyphFoldBelow ? 2 : 1) || atGlyphBottom(stems[j]) && y[j] - wr >= pixelBottomPixels) {
				w[j] = wr;
				allocated[j] = true;
			} else if (y[j] - wx >= pixelBottomPixels + (stems[j].hasGlyphFoldBelow ? 2 : 1) || atGlyphBottom(stems[j]) && y[j] - wx >= pixelBottomPixels) {
				w[j] = wx;
				if (w >= wr) allocated[j] = true;
			}
		};
		function allocateUp(j) {
			var sb = spaceBelow(y, w, j, pixelBottomPixels - 1);
			var sa = spaceAbove(y, w, j, pixelTopPixels + 1);
			var wr = properWidths[j];
			var wx = Math.min(wr, w[j] + sb);
			if (wx <= 1) return;
			if (sa > 1.75 && y[j] < avaliables[j].high) {
				if (sb + w[j] >= wr && y[j] - wr >= pixelBottomPixels || atGlyphBottom(stems[j]) && y[j] - wr + 1 >= pixelBottomPixels) {
					y[j] += 1;
					w[j] = wr;
					allocated[j] = true;
				} else if (y[j] - wx >= pixelBottomPixels || atGlyphBottom(stems[j]) && y[j] - wx + 1 >= pixelBottomPixels) {
					y[j] += 1;
					w[j] = wx;
					if (wx >= wr) allocated[j] = true;
				}
			}
		};

		for (var pass = 0; pass < 3; pass++) {
			// Allocate top and bottom stems
			for (var j = 0; j < stems.length; j++) if ((atGlyphTop(stems[j]) || atGlyphBottom(stems[j])) && !allocated[j]) { allocateDown(j) };
			for (var j = stems.length - 1; j >= 0; j--) if ((atGlyphTop(stems[j]) || atGlyphBottom(stems[j])) && !allocated[j]) { allocateUp(j) };
			// Allocate center stems
			for (var subpass = 0; subpass < WIDTH_ALLOCATION_PASSES; subpass++) {
				for (var j = 0; j < stems.length; j++) if (!allocated[j]) { allocateDown(j) };
				for (var j = stems.length - 1; j >= 0; j--) if (!allocated[j]) { allocateUp(j) };
			}
		}

		// Avoid thin strokes
		for (var pass = 0; pass < 3; pass++) if (WIDTH_GEAR_PROPER >= 2 && WIDTH_GEAR_MIN >= 2) {
			for (var psi = 0; psi < 2; psi++) for (var j = stems.length - 1; j >= 0; j--) if (([false, true][psi] || !stems[j].hasGlyphStemAbove) && w[j] < [properWidths[j], 2][psi]) {
				var able = true;
				for (var k = 0; k < j; k++) if (directOverlaps[j][k] && y[j] - w[j] - y[k] <= 1 && w[k] < (cover(stems[j], stems[k]) ? 2 : [2, 3][psi])) able = false;
				if (able) {
					w[j] += 1;
					for (var k = 0; k < j; k++) if (directOverlaps[j][k] && y[j] - w[j] - y[k] <= 0) {
						y[k] -= 1;
						w[k] -= 1;
					}
				}
			}
			for (var j = 0; j < stems.length; j++) if (stems[j].hasGlyphStemAbove && w[j] <= 1) {
				var able = true;
				for (var k = j + 1; k < stems.length; k++) {
					if (directOverlaps[k][j] && y[k] - y[j] <= w[k] + 1 && w[k] <= 2) able = false;
				}
				if (able) {
					for (var k = j + 1; k < stems.length; k++) if (directOverlaps[k][j] && y[k] - y[j] <= w[k] + 1) {
						w[k] -= 1
					}
					y[j] += 1;
					w[j] += 1;
				}
			};

			// Triplet balancing
			for (var t = 0; t < triplets.length; t++) {
				var j = triplets[t][0], k = triplets[t][1], m = triplets[t][2];
				// [3] 2 [3] 1 [2] -> [3] 1 [3] 1 [3]
				if (w[m] <= properWidths[j] - 1 && y[j] - w[j] - y[k] >= 2 && y[k] - w[k] - y[m] === 1 && y[k] < avaliables[k].high && y[m] < avaliables[k].high) {
					y[k] += 1; y[m] += 1; w[m] += 1;
					if (spaceAbove(y, w, k, pixelTopPixels + 1) < 1 || spaceAbove(y, w, m, pixelTopPixels + 1) < 1 || spaceBelow(y, w, k, pixelBottomPixels - 1) < 1) {
						y[k] -= 1;
						y[m] -= 1;
						w[m] -= 1;
					}
				}
				// [1] 1 [2] 2 [2] -> [2] 1 [2] 1 [2]
				else if (w[j] <= properWidths[j] - 1 && y[j] - w[j] - y[k] === 1 && y[k] - w[k] - y[m] === 2 && y[k] > avaliables[k].low) {
					w[j] += 1; y[k] -= 1;
					if (spaceBelow(y, w, j, pixelBottomPixels - 1) < 1 || spaceBelow(y, w, k, pixelBottomPixels - 1) < 1 || spaceAbove(y, w, m, pixelTopPixels + 1) < 1) { // reroll when a collision is made
						w[j] -= 1;
						y[k] += 1;
					}
				}
			}
			// Edge touch balancing
			for (var j = 0; j < stems.length; j++) {
				if (w[j] <= 1 && y[j] > pixelBottomPixels + 2) {
					var able = true;
					for (var k = 0; k < j; k++) if (directOverlaps[j][k] && !edgetouch(stems[j], stems[k])) {
						able = false;
					}
					if (able) {
						w[j] += 1;
					}
				}
			}
		};

		for (var j = 0; j < stems.length; j++) {
			stems[j].touchwidth = w[j] * uppx;
			stems[j].ytouch = y[j] * uppx;
		};
	};
	var instructions = []
	// Touching procedure
	function touchStemPoints(stems) {
		for (var j = 0; j < stems.length; j++) {
			var stem = stems[j], w = stem.touchwidth;

			var pos = ['ROUND', stem.posKey.id, stem.posKey.yori, Math.round(stem.posKeyAtTop ? stem.ytouch : stem.ytouch - w)];
			var adv = ['ALIGNW', stem.posKey.id, stem.advKey.id, stem.width / uppx, Math.round(w / uppx)]
			instructions.push({
				pos: pos,
				adv: adv,
				orient: stem.posKeyAtTop
			})
		};
	};

	if (!stems.length) return instructions;
	for (var j = 0; j < stems.length; j++) {
		stems[j].ytouch = stems[j].yori;
		stems[j].touchwidth = uppx;
	};
	(function () {
		var y0 = [];
		for (var j = 0; j < stems.length; j++) {
			y0[j] = Math.round(avaliables[j].center / uppx);
		}
		var og = new Individual(y0);
		if (og.collidePotential <= 0) {
			for (var j = 0; j < stems.length; j++) {
				stems[j].ytouch = og.gene[j] * uppx;
				stems[j].touchwidth = uppx;
				stems[j].roundMethod = stems[j].ytouch >= stems[j].yori ? 1 : -1;
			}
		} else {
			earlyAdjust(stems);
			uncollide(stems, 1);
			rebalance(stems);
			uncollide(stems, 0.5);
			rebalance(stems);
		};
	})();
	allocateWidth(stems);
	touchStemPoints(stems);
	return instructions;
}

exports.hint = hint;
},{"./roundings":10,"util":4}],8:[function(require,module,exports){

/**
 * Topological sorting function
 *
 * @param {Array} edges
 * @returns {Array}
 */

module.exports = exports = function(edges){
  return toposort(uniqueNodes(edges), edges)
}

exports.array = toposort

function toposort(nodes, edges) {
  var cursor = nodes.length
    , sorted = new Array(cursor)
    , visited = {}
    , i = cursor

  while (i--) {
    if (!visited[i]) visit(nodes[i], i, [])
  }

  return sorted

  function visit(node, i, predecessors) {
    if(predecessors.indexOf(node) >= 0) {
      throw new Error('Cyclic dependency: '+JSON.stringify(node))
    }

    if (visited[i]) return;
    visited[i] = true

    // outgoing edges
    var outgoing = edges.filter(function(edge){
      return edge[0] === node
    })
    if (i = outgoing.length) {
      var preds = predecessors.concat(node)
      do {
        var child = outgoing[--i][1]
        visit(child, nodes.indexOf(child), preds)
      } while (i)
    }

    sorted[--cursor] = node
  }
}

function uniqueNodes(arr){
  var res = []
  for (var i = 0, len = arr.length; i < len; i++) {
    var edge = arr[i]
    if (res.indexOf(edge[0]) < 0) res.push(edge[0])
    if (res.indexOf(edge[1]) < 0) res.push(edge[1])
  }
  return res
}

},{}],9:[function(require,module,exports){
var parseSFD = require('../sfdParser').parseSFD;
var findStems = require('../findstem').findStems;
var extractFeature = require('../extractfeature').extractFeature;
var hint = require('../hinter').hint;
var roundings = require('../roundings');



var defaultStrategy;
var strategy;
var input;
var glyphs;
function interpolate(a, b, c) {
	if (c.yori <= a.yori) c.ytouch = c.yori - a.yori + a.ytouch;
	else if (c.yori >= b.yori) c.ytouch = c.yori - b.yori + b.ytouch;
	else c.ytouch = (c.yori - a.yori) / (b.yori - a.yori) * (b.ytouch - a.ytouch) + a.ytouch;
}
function interpolateIP(a, b, c) {
	c.touched = true;
	c.ytouch = (c.yori - a.yori) / (b.yori - a.yori) * (b.ytouch - a.ytouch) + a.ytouch;
}
function IUPy(contours) {
	for (var j = 0; j < contours.length; j++) {
		var contour = contours[j];
		var k = 0;
		while (k < contour.points.length && !contour.points[k].touched) k++;
		if (contour.points[k]) {
			// Found a touched point in contour
			var kleft = k, k0 = k;
			var untoucheds = []
			for (var k = 0; k <= contour.points.length; k++) {
				var ki = (k + k0) % contour.points.length;
				if (contour.points[ki].touched) {
					var pleft = contour.points[kleft];
					var pright = contour.points[ki];
					var lower = pleft.yori < pright.yori ? pleft : pright
					var higher = pleft.yori < pright.yori ? pright : pleft
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
		contours[j].points[k].ytouch = contours[j].points[k].yori;
	}
}
var SUPERSAMPLING = 8;
var DPI = 2;
function BY_PRIORITY_SHORT(p, q) { return q[2] - p[2] }
function BY_PRIORITY_IP(p, q) { return q[3] - p[3] }
function RenderPreviewForPPEM(hdc, basex, basey, ppem) {
	var rtg = roundings.Rtg(strategy.UPM, ppem);
	var roundDown = roundings.Rdtg(strategy.UPM, ppem);

	for (var j = 0; j < glyphs.length; j++) {
		var glyph = glyphs[j].glyph, features = glyphs[j].features;
		untouchAll(glyph.contours);
		var actions = hint(features, ppem, strategy);

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
		actions.forEach(function (action) {
			glyph.indexedPoints[action.pos[1]].ytouch = action.pos[3];
			glyph.indexedPoints[action.adv[2]].ytouch = action.pos[3] + (action.orient ? (-1) : 1) * (action.adv[4] || Math.round(action.adv[3])) * (strategy.UPM / ppem);
			glyph.indexedPoints[action.pos[1]].touched = glyph.indexedPoints[action.adv[2]].touched = true
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
		features.shortAbsorptions.sort(BY_PRIORITY_SHORT).forEach(function (group) {
			var a = glyph.indexedPoints[group[0]]
			var b = glyph.indexedPoints[group[1]]
			b.touched = true;
			b.ytouch = b.yori + a.ytouch - a.yori;
		});
		// IPs
		features.interpolations.sort(BY_PRIORITY_IP).forEach(function (group) {
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
	eTemp.height = ppem * 3 + 3;
	var hTemp = eTemp.getContext('2d')
	hTemp.fillStyle = "white";
	hTemp.fillRect(0, 0, eTemp.width, eTemp.height);

	function txp(x) { return (x / strategy.UPM * ppem) * 3 * SUPERSAMPLING }
	function typ(y) { return (Math.round(-y / strategy.UPM * ppem) + Math.round(strategy.BLUEZONE_TOP_CENTER / strategy.UPM * ppem)) * 3 + 3 }
	// Fill
	hTemp.fillStyle = 'black';
	for (var m = 0; m < glyphs.length; m++) {
		hTemp.beginPath();
		for (var j = 0; j < glyphs[m].glyph.contours.length; j++) {
			var contour = glyphs[m].glyph.contours[j];
			// Layer 1 : Control outline
			hTemp.moveTo(txp(contour.points[0].xtouch + m * strategy.UPM), typ(contour.points[0].ytouch))
			for (var k = 1; k < contour.points.length; k++) {
				if (contour.points[k].on) {
					hTemp.lineTo(txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch))
				} else {
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
	var h = []; for (var j = 0; j < 3 * SUPERSAMPLING; j++) h[j] = 1;
	var jSample = 0;
	var a = 3 * SUPERSAMPLING;
	for (var j = 0; j < ppem; j++) {
		for (var k = 0; k < ppem * glyphs.length; k++) {
			for (var component = 0; component < 3; component++) {
				for (var ss = 0; ss < SUPERSAMPLING; ss++) {
					var d = ori.data[w] / 255;
					a += d
					a -= h[jSample]
					h[jSample] = d;
					w += 4;
					jSample += 1;
					if (jSample >= 3 * SUPERSAMPLING) jSample = 0;
				}
				var alpha = a / (3 * SUPERSAMPLING);
				for (var dr = 0; dr < DPI; dr++) for (var dc = 0; dc < DPI; dc++) {
					aa.data[((j * DPI + dr) * aa.width + k * DPI + dc) * 4 + component] = 255 * Math.pow(alpha, 1 / 2.2)
				}
			}
			for (var dr = 0; dr < DPI; dr++) for (var dc = 0; dc < DPI; dc++) {
				aa.data[((j * DPI + dr) * aa.width + k * DPI + dc) * 4 + 3] = 255
			}
		}
		w += 4 * 2 * 3 * SUPERSAMPLING * ppem * glyphs.length
	};
	hdc.putImageData(aa, basex, basey)
};

function render() {
	glyphs = input.map(function (passage, j) {
		if (passage) {
			var glyph = parseSFD(passage.slice(9, -12))
			return {
				glyph: glyph,
				features: extractFeature(findStems(glyph, strategy), strategy)
			}
		}
	});
	console.log(glyphs);
	var hPreview = document.getElementById('preview').getContext('2d');
	hPreview.font = (12 * DPI) + 'px sans-serif'
	var y = 10 * DPI;
	for (var ppem = 10; ppem < 36; ppem++) {
		// fill with red block
		hPreview.fillStyle = 'white';
		hPreview.fillRect(0, y, 128 + glyphs.length * DPI * ppem, y + DPI * ppem)
		// render 
		setTimeout(function (y, ppem) { return function () { RenderPreviewForPPEM(hPreview, 128, y, ppem) } } (y, ppem), 0);
		hPreview.fillStyle = 'black';
		hPreview.fillText(ppem + '', 0, y + ppem * (strategy.BLUEZONE_TOP_CENTER / strategy.UPM) * DPI)
		y += Math.round(ppem * 1.2) * DPI
	}
};

var strategyControlGroups = [
	['UPM', 'BLUEZONE_WIDTH', 'BLUEZONE_TOP_CENTER', 'BLUEZONE_TOP_LIMIT', 'BLUEZONE_TOP_BAR', 'BLUEZONE_TOP_DOTBAR', 'BLUEZONE_BOTTOM_CENTER', 'BLUEZONE_BOTTOM_LIMIT', 'BLUEZONE_BOTTOM_BAR', 'BLUEZONE_BOTTOM_DOTBAR'],
	['MIN_STEM_WIDTH', 'MAX_STEM_WIDTH', 'MOST_COMMON_STEM_WIDTH', 'MAX_SEGMERGE_DISTANCE', 'ABSORPTION_LIMIT', 'STEM_SIDE_MIN_RISE', 'STEM_SIDE_MIN_DESCENT', 'STEM_CENTER_MIN_RISE', 'STEM_CENTER_MIN_DESCENT', 'STEM_SIDE_MIN_DIST_RISE', 'STEM_SIDE_MIN_DIST_DESCENT', 'SLOPE_FUZZ', 'Y_FUZZ'],
	['POPULATION_LIMIT', 'CHILDREN_LIMIT', 'EVOLUTION_STAGES', 'MUTANT_PROBABLITY', 'ELITE_COUNT'],
	['COEFF_DISTORT', 'ABLATION_IN_RADICAL', 'ABLATION_RADICAL_EDGE', 'ABLATION_GLYPH_EDGE', 'ABLATION_GLYPH_HARD_EDGE', 'COEFF_PORPORTION_DISTORTION', 'COEFF_A_MULTIPLIER', 'COEFF_A_SAME_RADICAL', 'COEFF_A_SHAPE_LOST', 'COEFF_A_FEATURE_LOSS', 'COEFF_A_RADICAL_MERGE', 'COEFF_C_MULTIPLIER', 'COEFF_C_SAME_RADICAL', 'COEFF_S', 'COLLISION_MIN_OVERLAP_RATIO']
]

function createAdjusters() {
	var container = document.getElementById('adjusters');
	function update() {
		setTimeout(render, 100);
		var buf = [];
		for (var k in strategy) if ((typeof strategy[k] === 'number' || typeof strategy[k] === 'string') && strategy[k] !== defaultStrategy[k]) buf.push("--" + k + "=" + strategy[k]);
		resultPanel.innerHTML = buf.join(' ');
		return false;
	}
	// Numeric parameters
	for (var g = 0; g < strategyControlGroups.length; g++) {
		var ol = document.createElement('ol')
		for (var j = 0; j < strategyControlGroups[g].length; j++) {
			var key = strategyControlGroups[g][j];
			if (typeof strategy[key] === 'number') (function (key) {
				var d = document.createElement('li');
				d.innerHTML += '<span>' + key + '</span>';
				var input = document.createElement('input');
				input.value = strategy[key];
				input.type = 'number';

				input.onchange = function () {
					strategy[key] = input.value - 0;
					update();
				};
				function btn(shift) {
					var button = document.createElement('button');
					button.innerHTML = (shift > 0 ? '+' + shift : '-' + (-shift));
					button.onclick = function () {
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
	(function () {
		var ol = document.createElement('ol');
		var d = document.createElement('li');
		d.innerHTML += '<span>gears</span>';
		d.className = "text"
		var input = document.createElement('input');
		input.value = JSON.stringify(strategy.PPEM_STEM_WIDTH_GEARS);
		input.onchange = function () {
			try {
				var g = JSON.parse(input.value);
				strategy.PPEM_STEM_WIDTH_GEARS = g;
				strategy.gears = JSON.stringify(input.value);
				update();
			} catch (ex) {

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
$.getJSON("/characters.json", function (data) {
	$.getJSON("/strategy.json", function (strg) {
		defaultStrategy = strg.default;
		strategy = strg.start;
		input = data;
		createAdjusters();
	});
});
},{"../extractfeature":5,"../findstem":6,"../hinter":7,"../roundings":10,"../sfdParser":11}],10:[function(require,module,exports){
function toF26D6(x) {
	return Math.round(x * 64) / 64
}
function rtg(x, upm, ppem) {
	if (x >= 0) return Math.round(toF26D6(x / upm * ppem)) / ppem * upm;
	else return -Math.round(toF26D6(-x / upm * ppem)) / ppem * upm;
}
function Rtg(upm, ppem) {
	var uppx = upm / ppem;
	return function (x) {
		if (x >= 0) return Math.round(toF26D6(x / uppx)) * uppx
		else return -Math.round(toF26D6(-x / uppx)) * uppx
	}
}
function rutg(x, upm, ppem) {
	if (x >= 0) return Math.ceil(toF26D6(x / upm * ppem)) / ppem * upm;
	else return -Math.ceil(toF26D6(-x / upm * ppem)) / ppem * upm;
}
function Rutg(upm, ppem) {
	var uppx = upm / ppem;
	return function (x) {
		if (x >= 0) return Math.ceil(toF26D6(x / uppx)) * uppx
		else return -Math.ceil(toF26D6(-x / uppx)) * uppx
	}
}
function rdtg(x, upm, ppem) {
	if (x >= 0) return Math.floor(toF26D6(x / upm * ppem)) / ppem * upm;
	else return -Math.floor(toF26D6(-x / upm * ppem)) / ppem * upm;
}
function Rdtg(upm, ppem) {
	var uppx = upm / ppem;
	return function (x) {
		if (x >= 0) return Math.floor(toF26D6(x / uppx)) * uppx
		else return -Math.floor(toF26D6(-x / uppx)) * uppx
	}
}
exports.rtg = rtg;
exports.rutg = rutg;
exports.rdtg = rdtg;
exports.Rtg = Rtg;
exports.Rutg = Rutg;
exports.Rdtg = Rdtg;
},{}],11:[function(require,module,exports){
var Contour = require('./types.js').Contour;
var Point = require('./types.js').Point;
var Glyph = require('./types.js').Glyph;

function numberPoints(contours) {
	var n = 0
	for (var j = 0; j < contours.length; j++) {
		for (var k = 0; k < contours[j].points.length - 1; k++) if (!contours[j].points[k].interpolated) {
			contours[j].points[k].id = (n++)
		}
	}
	return n;
}
function parseSFD(input) {
	var contours = [], currentContour = null, indexedPoints = [];
	input = input.trim().split('\n');
	var currentid = -1;
	var sequentid = -1;
	var nPoints = 0;
	for (var j = 0; j < input.length; j++) {
		var line = input[j].trim().split(/ +/);
		var flags = line[line.length - 1].split(',');
		currentid = flags[1] - 0;
		if (line[2] === 'm') {
			// Moveto
			if (currentContour) contours.push(currentContour);
			currentContour = new Contour();
			var pt = new Point(line[0] - 0, line[1] - 0, true, currentid)
			currentContour.points.push(pt)
			indexedPoints[currentid] = pt;
		} else if (line[2] === 'l' && currentContour) {
			// Lineto
			var pt = new Point(line[0] - 0, line[1] - 0, true, currentid)
			currentContour.points.push(pt)
			indexedPoints[currentid] = pt;
		} else if (line[6] === 'c' && currentContour) {
			// curveTo
			var ct = new Point(line[0] - 0, line[1] - 0, false, sequentid)
			currentContour.points.push(ct)
			indexedPoints[sequentid] = ct;
			var pt = new Point(line[4] - 0, line[5] - 0, true, currentid)
			currentContour.points.push(pt)
			indexedPoints[currentid] = pt;
		}
		sequentid = flags[2] - 0;
		nPoints = Math.max(nPoints, currentid, sequentid)
	}
	if (currentContour) contours.push(currentContour);
	contours.forEach(function (c) { c.stat() });
	delete indexedPoints[-1];
	var glyph = new Glyph(contours);
	glyph.nPoints = nPoints;
	glyph.indexedPoints = indexedPoints;
	return glyph
}

exports.parseSFD = parseSFD;
},{"./types.js":12}],12:[function(require,module,exports){
function Point(x, y, on, id) {
	this.xori = x;
	this.yori = y;
	this.xtouch = x;
	this.ytouch = y;
	this.touched = false;
	this.donttouch = false;
	this.on = on;
	this.id = id;
	this.interpolated = id < 0;
}
function Contour() {
	this.points = []
	this.ccw = false
}
Contour.prototype.stat = function () {
	var points = this.points;
	if (
		points[0].yori > points[points.length - 2].yori && points[0].yori >= points[1].yori
		|| points[0].yori < points[points.length - 2].yori && points[0].yori <= points[1].yori) {
		points[0].yExtrema = true;
		points[0].yStrongExtrema = points[0].yori > points[points.length - 2].yori + 1 && points[0].yori > points[1].yori - 1
			|| points[0].yori < points[points.length - 2].yori + 1 && points[0].yori < points[1].yori - 1;
	}
	if (
		points[0].xori > points[points.length - 2].xori && points[0].xori >= points[1].xori
		|| points[0].xori < points[points.length - 2].xori && points[0].xori <= points[1].xori) {
		points[0].xExtrema = true;
		points[0].xStrongExtrema = points[0].xori > points[points.length - 2].xori + 1 && points[0].xori > points[1].xori - 1
			|| points[0].xori < points[points.length - 2].xori + 1 && points[0].xori < points[1].xori - 1;
		if (points[0].xStrongExtrema) {
			points[0].atleft = points[0].xori < points[points.length - 2].xori + 1 && points[0].xori < points[1].xori - 1;
		}
	}
	for (var j = 1; j < points.length - 1; j++) {
		if (points[j].yori > points[j - 1].yori && points[j].yori >= points[j + 1].yori
			|| points[j].yori < points[j - 1].yori && points[j].yori <= points[j + 1].yori) {
			points[j].yExtrema = true;
			points[j].yStrongExtrema = points[j].yori > points[j - 1].yori + 1 && points[j].yori >= points[j + 1].yori - 1
				|| points[j].yori < points[j - 1].yori + 1 && points[j].yori <= points[j + 1].yori - 1;
		}
		if (points[j].xori > points[j - 1].xori && points[j].xori >= points[j + 1].xori
			|| points[j].xori < points[j - 1].xori && points[j].xori <= points[j + 1].xori) {
			points[j].xExtrema = true;
			points[j].xStrongExtrema = points[j].xori > points[j - 1].xori + 1 && points[j].xori >= points[j + 1].xori - 1
				|| points[j].xori < points[j - 1].xori + 1 && points[j].xori <= points[j + 1].xori - 1;
			if (points[j].xStrongExtrema) {
				points[j].atleft = points[j].xori < points[j - 1].xori + 1 && points[j].xori <= points[j + 1].xori - 1;
			}
		}
	};
	var xoris = this.points.map(function (p) { return p.xori });
	var yoris = this.points.map(function (p) { return p.yori });
	this.xmax = Math.max.apply(Math, xoris);
	this.ymax = Math.max.apply(Math, yoris);
	this.xmin = Math.min.apply(Math, xoris);
	this.ymin = Math.min.apply(Math, yoris);
	this.orient();
}
Contour.prototype.orient = function () {
	// Findout PYmin
	var jm = 0, ym = this.points[0].yori
	for (var j = 0; j < this.points.length - 1; j++) if (this.points[j].yori < ym) {
		jm = j; ym = this.points[j].yori;
	}
	var p0 = this.points[(jm ? jm - 1 : this.points.length - 2)], p1 = this.points[jm], p2 = this.points[jm + 1];
	var x = ((p0.xori - p1.xori) * (p2.yori - p1.yori) - (p0.yori - p1.yori) * (p2.xori - p1.xori));
	if (x < 0) { this.ccw = true; }
	else if (x === 0) { this.ccw = p2.xori > p1.xori; }
	// Adjacency
	var pt = this.points[0];
	for (var j = 0; j < this.points.length - 1; j++) if (this.points[j].on) {
		this.points[j].prev = pt;
		pt = this.points[j];
	}
	this.points[0].prev = pt;
}
var inPoly = function (point, vs) {
	// ray-casting algorithm based on
	// http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

	var x = point.xori, y = point.yori;

	var inside = false;
	for (var i = 0, j = vs.length - 2; i < vs.length - 1; j = i++) {
		var xi = vs[i].xori, yi = vs[i].yori;
		var xj = vs[j].xori, yj = vs[j].yori;

		var intersect = ((yi > y) !== (yj > y))
			&& (yj > yi ?
				(x - xi) * (yj - yi) < (xj - xi) * (y - yi) :
				(x - xi) * (yj - yi) > (xj - xi) * (y - yi));
		if (intersect) inside = !inside;
	}

	return inside;
};
Contour.prototype.includes = function (that) {
	for (var j = 0; j < that.points.length - 1; j++) {
		if (!inPoly(that.points[j], this.points)) return false
	}
	return true;
}
function Glyph(contours) {
	this.contours = contours || []
	this.stems = []
}
Glyph.prototype.containsPoint = function (x, y) {
	var nCW = 0, nCCW = 0;
	for (var j = 0; j < this.contours.length; j++) {
		if (inPoly({ xori: x, yori: y }, this.contours[j].points)) {
			if (this.contours[j].ccw) nCCW += 1;
			else nCW += 1;
		}
	};
	return nCCW != nCW
}

exports.Glyph = Glyph;
exports.Contour = Contour;
exports.Point = Point;
},{}]},{},[9]);
