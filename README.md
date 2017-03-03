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
PPEM_MIN = 11
PPEM_MAX = 36
CANONICAL_STEM_WIDTH = [[36,67]]
CANONICAL_STEM_WIDTH_DENSE = [[36,67]]
ABSORPTION_LIMIT = 120
STEM_SIDE_MIN_RISE = 36
STEM_SIDE_MIN_DESCENT = 53
STEM_CENTER_MIN_RISE = 36
STEM_CENTER_MIN_DESCENT = 50
STEM_SIDE_MIN_DIST_RISE = 75
STEM_SIDE_MIN_DIST_DESCENT = 75
Y_FUZZ = 8
BLUEZONE_BOTTOM_CENTER = -73
BLUEZONE_BOTTOM_LIMIT = -45
BLUEZONE_BOTTOM_BAR_REF = -75
BLUEZONE_TOP_CENTER = 832
BLUEZONE_TOP_LIMIT = 813
BLUEZONE_TOP_BAR_REF = 799
BLUEZONE_TOP_BAR = [[12,820],[15,820],[16,805],[32,799]]
BLUEZONE_TOP_DOTBAR = [[12,808],[16,800],[32,790]]
BLUEZONE_BOTTOM_BAR = [[16,-49],[36,-48]]
BLUEZONE_BOTTOM_DOTBAR = [[12,-75],[16,-70],[36,-60]]

[cvt]
padding = 10
```

The hinting parameters are stored in `hinting` section. They include:

* **Metric Parameters**

  * **UPM** : The units-per-em value of your sfd
* **Hinting Ranges**
  * **PPEM_MIN**: Minimal size being hinted.
  * **PPEM_MAX**: Maximal size being hinted.
* **Top Positioning Parameters**

  * **BLUEZONE_TOP_CENTER** and **BLUEZONE_TOP_LIMIT** : Center and lower limit of the top blue zone. Use characters like “木” to decide the value of **BLUEZONE_TOP_CENTER**.
  * **BLUEZONE_TOP_BAR_REF** : The "reference" position of the upper edge of "top" hotizontal strokes without any stroke above or touching its upper edge. This value is used to determine the relative position of strokes. Can be either a constant number, or a size-dependent value, written in the same  format as **BLUEZONE_TOP_BAR** (see below).

  * **BLUEZONE_TOP_BAR**: The controlled position of topmost horizontal stroke's upper edges in small, middle and large font sizes. Carefully adjusting them can optimize the visual representation of the hinted result. This applies to the topmost strokes of characters “里”.
    It should be an array containing correspondences between character size (in ppem) and the desired position (in emu), like `[[12,820],[15,820],[16,805],[32,799]]`. Value for text sizes not mentioned will be interpolated monotonically using closest records.
  * **BLUEZONE_TOP_DOTBAR**: The controlled position of the upper edge of "top" horizontal strokes with stroke touching its upper edge. Like the position of the first horizontal stroke in “章”. It follows the same format as **BLUEZONE_TOP_BAR**.
* **Bottom Positioning Parameters**: Similar as the previous  section, with the name **\_TOP\_** replaced to **\_BOTTOM\_**, and applies to the bottommost features of the characters.
* **Stem Detection Parameters**

    * **ABSORPTION_LIMIT**: The limit when a horizontal extremum being linked to a point aligned to the top or bottom blue zone. Useful when preserving diagonal strokes’ width. Preferred value: slightly larger than **MAX_STEM_WIDTH**.
    * **CANONICAL_STEM_WIDTH** : The “Canonical” stroke width among the entire font. Measured in a loose character like “里”. Can be either a constant number, or a size-dependent value, in the same format as **BLUEZONE_TOP_BAR**.
    * **CANONICAL_STEM_WIDTH_DENSE**: The “Canonical” stroke width of dense characters like “襄”. Useful in bold weights. Can be either a constant number, or a size-dependent value, in the same format as **BLUEZONE_TOP_BAR**. For lighter width, it should be identical to **CANONICAL_STEM_WIDTH**. 
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
ideohint visual hans.hgl -w "<test characters>" [<parameters>]
```

It will provide an interactive parameter adjustment utility accessable from `localhost:9527`.

### Visual TrueType interface

The subcommand `ideohint vtt` will produce a VTT-compatible XML with VTTTalks instead of raw instructions. The usage is:

```bash
otfccdump in.ttf -o in.otd
...
ideohint vtt hints.hgi in.otd -o out.xml
```

Depending on the CVT padding, ideohint vtt will show the required CVT entries in VTT, and produce a XML representing the hinted instructions. You can import them to your font (`in.ttf`) using VTT's built-in "import" feature.

As an advice, you can use the TTF with VTT's editable instructions as the input of ideohint, so that you can apply the hints generated immediately after ideohint finishes hinting.