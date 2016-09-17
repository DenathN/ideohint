# ideohint ![npm](https://img.shields.io/npm/v/ideohint.svg)

Optimized hinter for ideographs, built on Node.js and [otfcc](https://github.com/caryll/otfcc).

**NOTE: sfdhanautohint is now deprecated.**

## Overview

Ideographs used in Chinese, Japanese, and Korean often contain many strokes which are difficult to render distinctly at small sizes. Simply aligning horizontal and vertical strokes to the pixel grid (e.g., by rounding each stroke to the nearest grid point) is not sufficient to produce a clear image and can often lead to disastrous results (upper row). The *sfdhanautohint* generates optimized grid fitting instructions which performs character simplification when needed, to ensure that each character remains clear and legible, even at small sizes (lower row).

![sfdhanautohint side-by-side comparison](https://raw.githubusercontent.com/be5invis/sfdhanautohint/master/example-img/example.png)

The core hinting strategy is to minimize a number called "readbility potential" which measures the readibility loss of readibility caused by gridfitting, including stem collisions and stem merges. The minimization is achieved via a genetic algorithm.

## Installation

```bash
npm install ideohint -g
```

## Usage

`ideohint` takes OpenType dumps generated from [`otfccdump`](https://github.com/caryll/otfcc) as its input.

There are four major sub-commands: `otd2hgl`, `extract`, `hint`, and `apply`. To prepare your input file, use [`otfccdump`](https://github.com/caryll/otfcc) to dump the TTF you want to hint.

``` bash
# Prepare OTD:
otfccdump input.ttf -o input.otd
# Hint your font:
ideohint otd2hgl input.otd -o glyphlist.hgl [--onlyhan]
ideohint extract <glyphlist.hgl> -o <features.hgf> [<strategy parameters>]
ideohint hint <features.hgf> -o <instructions.hgi> [<strategy parameters>]
ideohint apply <instructions.hgi> <input.otd> -o <output.otd> [<strategy parameters>]
# Building TTF:
otfccbuild output.otd -o output.ttf
```

### `otd2hgl`

`otd2hgl` converts OTFCC’s dump into an internal format called “hgl”. The command is:

```bash
ideohint otd2hgl input.otd -o output.hgl [--ideo-only]
```

When `--ideo-only` is present, only ideographs in the input font (identified via `cmap` table) will be preserved and hinted.

### `extract`, `hint` and `apply`

These three sub-commands do the main hinting part. `extract` will extract features from the glyph list, `hint` will generate TrueType instructions using the features, and `apply` will apply the instructions into yoru font. All thres sub-commands accept **strategy parameters** and **CVT padding**, which are important in the hinting process.

#### Strategy Parameters

The strategy parameters determines how `ideohint` generate the instructions. It is stored in a TOML file, and be specified using `--parameters param.toml` when calling the command. An example may be:

```toml
[hinting]
MAX_STEM_WIDTH = 90
MOST_COMMON_STEM_WIDTH = 50
ABSORPTION_LIMIT = 95
STEM_SIDE_MIN_DIST_RISE = 120
STEM_SIDE_MIN_DIST_DESCENT = 120
BLUEZONE_BOTTOM_CENTER = -96
BLUEZONE_TOP_CENTER = 805
BLUEZONE_BOTTOM_LIMIT = -75
BLUEZONE_TOP_LIMIT = 783
BLUEZONE_BOTTOM_BAR = -73
BLUEZONE_TOP_BAR = 790
BLUEZONE_BOTTOM_DOTBAR = -78
BLUEZONE_TOP_DOTBAR = 775
SLOPE_FUZZ = 0.024
PPEM_STEM_WIDTH_GEARS = [[0,1,1],[25,2,2]]

[cvt]
padding = 10
```

The hinting parameters are stored in `hinting` section. They include:

* **Metric Parameters**

  * **UPM** : The units-per-em value of your sfd
  * **BLUEZONE_TOP_CENTER** and **BLUEZONE_TOP_LIMIT** : Center and lower limit of the top blue zone. Use characters like “木” to decide the value of **BLUEZONE_TOP_CENTER**.
  * **BLUEZONE_BOTTOM_CENTER** and **BLUEZONE_BOTTOM_LIMIT**: Center and upper limit of the bottom blue zone. Use characters like “木” to decide the value of **BLUEZONE_BOTTOM_CENTER**.
  * **BLUEZONE_TOP_BAR** : Common position of the upper edge of "top" hotizontal strokes without any stroke above or touching its upper edge. Like the position of the first horizontal stroke in “里”.
  * **BLUEZONE_BOTTOM_BAR** : Common position of the lower edge of "bottom" hotizontal strokes without any stroke below or touching its lower edge. Like the position of the lowest horizontal stroke in “里”.
  * **BLUEZONE_TOP_DOTBAR** : Common position of the upper edge of "top" hotizontal strokes with stroke touching its upper edge. Like the position of the first horizontal stroke in “章”.
  * **BLUEZONE_BOTTOM_DOTBAR** : Common position of the lower edge of "bottom" hotizontal strokes with stroke touching its upper edge.

* **Stem Detection Parameters**

  * **MIN_STEM_WIDTH** and **MAX_STEM_WIDTH** : Minimum and maximum of stem width. Stems thinner or thicker than this limit will be ignored.
  * **ABSORPTION_LIMIT**: The limit when a horizontal extremum being linked to a point aligned to the top or bottom blue zone. Useful when preserving diagonal strokes’ width. Preferred value: slightly larger than **MAX_STEM_WIDTH**.
  * **CANONICAL_STEM_WIDTH** : The “Canonical” stroke width among the entire font. Measured in a loose character like “里”. 
  * **CANONICAL_STEM_WIDTH_SMALL**: The “Canonical” stroke width used under small sizes. Measured in a loose character like “里”. Preferred value: Equal to or small smaller than **CANONICAL_STEM_WIDTH**.
  * **CANONICAL_STEM_WIDTH_DENSE**: The “Canonical” stroke width of dense characters like “襄”. Useful in bold weights. For lighter width, it should be identical to **CANONICAL_STEM_WIDTH**.
  * **STEM_SIDE_MIN_RISE** : The maximum height of decorative shapes placed aside a hotizontal stem's upper edge.
  * **STEM_SIDE_MIN_DESCENT** : The maximum depth of close decorative shapes placed aside a hotizontal stem's lower edge.
  * **STEM_CENTER_MIN_RISE** : The maximum height of close decorative shapes placed above a hotizontal stem's upper edge.
  * **STEM_CENTER_MIN_DESCENT** : The maximum depth of decorative shapes placed below a hotizontal stem's lower edge.
  * **STEM_SIDE_MIN_DIST_RISE** : The maximum height of distanced decorative shapes placed aside a hotizontal stem's upper edge.
  * **STEM_SIDE_MIN_DIST_DESCENT** : The maximum depth of distanced decorative shapes placed aside a hotizontal stem's lower edge.

#### CVT padding

When building a composite font with both ideographs and letters, you may use other tools (like `ttfautohint`) to generate hints for non-ideographic characters. To avoid conflict of `cvt ` table, a number called **cvt padding** should be used. This value should be larger than the length of the `cvt ` table generated by the hinter for non-ideographs. To specify, you can either:

- set the `padding` value in parameter file’s `cvt` section, or
- pass a command-line parameter `--CVT_PADDING` when calling `ideohint hint` and `ideohint apply`.

An example workflow of hinting a complete font may be (assuming you are using `ttfautohint`):

``` bash
ttfautohint input.ttf step1.ttf
otfccdump step1.ttf -o step2.otd
ideohint otd2hgl step2.otd -o step3.hgl --ideo-only
ideohint extract step3.hgl -o step4.hgf --parameters params.toml
ideohint hint    step4.hgf -o step5.hgi --parameters params.toml
ideohint apply   step5.hgi step2.otd -o output.otd --parameters params.toml
otfccbuild output.otd -o output.ttf
```

### Parallism

Since `extract` and `hint` may take a lot of time, we have a few extra parameters to help you out:

* `-d` - blocks of work to divide into.
* `-m` - which block of work to process.

You can use these parameters to slice the input into multiple parallel tasks, and produce multiple outputs. To merge the outputs, use `ideohint merge`, which works for both `hgf` and `hgi`.

An example:

``` bash
ideohint hint -d 10 -m 0 large.hgf -o part0.hgi <parameters>
ideohint hint -d 10 -m 1 large.hgf -o part1.hgi <parameters>
......
ideohint hint -d 10 -m 9 large.hgf -o part2.hgi <parameters>
ideohint merge -o large.hgi part0.hgi part1.hgi ... part9.hgi
```

With the help with [GNU Parallel](https://gnu.org/s/parallel/) or `make`, it will provide a significant performance boost.

### Interactive Parameter Adjustment

For strategy parameters, you can adjust them using the `visual` sub-command:

``` bash
ideohint visual hans.sfd -w "<test characters>" [<strategy parameters>]
```

It will provide an interactive parameter adjustment utility accessable from `localhost:9527`.