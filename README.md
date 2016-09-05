# sfdhanautohint [![npm version](https://badge.fury.io/js/sfdhanautohint.svg)](https://badge.fury.io/js/sfdhanautohint)

An optimized hinting genreator for Han characters powered by Node.js.

## Components

There are five major components in `sfdhanautohint`:

- `sah-extract-features`, The feature extracter. Produces `.hgf` feature files.

- `sah-hgfhint`, the major part, generates gridfit instructions optimized for ideographs. Produces `.hgi` instruction files.
- `sah-applyhgi`, which applies `.hgi` files into `sfd` input.
- `fontforge-scripts/prepare.pe`, the Fontforge script used to prepare a proper `.sfd` file used by `hanhint`.
- `fontforge-scripts/finish.pe`, the Fontforge script which generates gridfit for non-ideographs.

## Hinting Strategy

Chinese, Japanese, and Korean characters often contain many strokes which are difficult to render distinctly at small sizes. Simply aligning horizontal and vertical strokes to the pixel grid (e.g., by rounding each stroke to the nearest grid point) is not sufficient to produce a clear image and can often lead to disastrous results (upper row). The *sfdhanautohint* generates optimized grid fitting instructions which performs character simplification when needed, to ensure that each character remains clear and legible, even at small sizes (lower row).

![sfdhanautohint side-by-side comparison](https://raw.githubusercontent.com/be5invis/sfdhanautohint/master/example-img/example.png)

The core hinting strategy is to minimize a number called "readbility potential" which measures the readibility loss of readibility caused by gridfitting, including stem collisions and stem merges. The minimization is achieved via a genetic algorithm.

## Usage

There are four major commands: `sah-otd2hgl`, `sah-extract-features`, `sah-hgfhint`, `sah-applyhgi`. To prepare your input file, use [`otfccdump`](https://github.com/caryll/otfcc) to dump the TTF you want to hint.

``` bash
# Prepare OTD:
otfccdump input.ttf -o input.otd
# Do the hint
sah-otd2hgl input.otd -o glyphlist.hgl [--onlyhan]
sah-extract-features <glyphlist.otd> -o <features.hgf> [<strategy parameters>]
sah-hgfhint <features.hgf> -o <instructions.hgi> [<strategy parameters>]
sah-applyhgi <instructions.hgi> <input.otd> -o <output.otd> [<strategy parameters>]
# Building TTF:
otfccbuild output.otd -o output.ttf
```

### `sah-otd2hgl`

`sah-otd2hgl` converts OTFCC’s dump into an internal format called “hgl”. The command is:

```bash
sah-otd2hgl input.otd -o output.hgl [--onlyhan]
```

When parameter `--onlyhan` is present, only ideographs in the input font (identified via `cmap` table) will be preserved and hinted.

### `sah-extract-features`, `sah-hgfhint` and `sah-applyhgi`

#### Strategy Parameters

The strategy parameters determines how `sfdhanautohint` generate the instructions. It is stored in a TOML file, and be specified using `--parameters param.toml` when calling the command. An example may be:

```toml
[hinting]
MAX_STEM_WIDTH = 90
MAX_SEGMERGE_DISTANCE = 90
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
  * **PPEM_STEM_WIDTH_GEARS** : Stroke width allocation strategy. It is an array like `[[0,1,1],[20,2,1],[22,2,2]]`, each item is a triplet: ppem, common width (in pixels) and minimum width. The term `[20,2,1]` stands for “for sizes being 20,21px, most strokes are 2 pixels wide, though some thin strokes will be 1 pixel wide, even if the space below or undef is enough”.

* **Stem Detection Parameters**

  * **MIN_STEM_WIDTH** and **MAX_STEM_WIDTH** : Minimum and maximum of stem width
  * **MOST_COMMON_STEM_WIDTH** : The common stem width
  * **STEM_SIDE_MIN_RISE** : The maximum height of decorative shapes placed aside a hotizontal stem's upper edge.
  * **STEM_SIDE_MIN_DESCENT** : The maximum depth of close decorative shapes placed aside a hotizontal stem's lower edge.
  * **STEM_CENTER_MIN_RISE** : The maximum height of close decorative shapes placed above a hotizontal stem's upper edge.
  * **STEM_CENTER_MIN_DESCENT** : The maximum depth of decorative shapes placed below a hotizontal stem's lower edge.
  * **STEM_SIDE_MIN_DIST_RISE** : The maximum height of distanced decorative shapes placed aside a hotizontal stem's upper edge.
  * **STEM_SIDE_MIN_DIST_DESCENT** : The maximum depth of distanced decorative shapes placed aside a hotizontal stem's lower edge.

#### CVT padding

When building a composite font with both ideographs and letters, you may use other tools (like `ttfautohint`) to generate hints for non-ideographic characters. To avoid conflict of `cvt ` table, a number called **cvt padding** should be used. This value should be larger than the length of the `cvt ` table generated by the hinter for non-ideographs. To specify, you can either:

- set the `padding` value in parameter file’s `cvt` section, or
- pass a command-line parameter `--CVT_PADDING` when calling `sah-hgfhint` and `sah-applyhgi`.

``` bash
sah-applyhgi <instructions.hgi> <hans.sfd> -o <hans-hinted.sfd> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
sah-applyhgi <instructions.hgi> <nonhan.sfd> -o <nonhan-patched.sfd> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
<merge han-hinted.sfd into nonhan-patched.sfd to create a composite font>
```

#### Parallism

`Since `hgfhint` takes a lot of time, so we have a few extra parameters to help you out:

* `-d` - blocks of work to divide into
* `-m` - which block of work to process

When using them you should to this:

``` bash
sah-hgfhint -d 10 -m 0 large.hgf -o part0.hgi <parameters>
sah-hgfhint -d 10 -m 1 large.hgf -o part1.hgi <parameters>
......
sah-hgfhint -d 10 -m 9 large.hgf -o part2.hgi <parameters>
sah-mergehgi -o large.hgi part0.hgi part1.hgi ... part9.hgi
```

With the help with [GNU Parallel](https://gnu.org/s/parallel/) or `make`, it will provide a significant performance boost.

## Interactive Parameter Adjustment

For strategy parameters, you can adjust them using the `paramadj`:

``` bash
sah-paramadj hans.sfd -w "<test characters>" [<strategy parameters>]
```

It will provide an interactive parameter adjustment utility accessable from `localhost:9527`.