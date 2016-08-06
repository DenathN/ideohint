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

The main command `hanhint` takes a Truetype (quadratic), unhinted `.sfd` font file into hinted font.

``` bash
sah-extract-features <hans.sfd> -o <features.hgf> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
sah-hgfhint <features.hgf> -o <instructions.hgi> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
sah-applyhgi <instructions.hgi> <hans.sfd> -o <hans-hinted.sfd> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
```

The input file `hans.sfd` should

* Have TrueType point index information
* Contain Han characters only
* Do not have any TT instructions

You can obtain such SFDs by directly saving an unhinted TTF into SFD. It is recommended to separate non-Han characters into a separate SFD file and merge them after the Han part is hinted.

The strategy parameters determines how `sfdhanautohint` generate the instructions. The key parameters are:

* **Metric Parameters**

  * **UPM** : The units-per-em value of your sfd
  * **BLUEZONE_TOP_CENTER** and **BLUEZONE_TOP_LIMIT** : Center and lower limit of the top blue zone. Use characters like “木” to decide the value of **BLUEZONE_TOP_CENTER**.
  * **BLUEZONE_BOTTOM_CENTER** and **BLUEZONE_BOTTOM_LIMIT**: Center and upper limit of the bottom blue zone. Use characters like “木” to decide the value of **BLUEZONE_BOTTOM_CENTER**.
  * **BLUEZONE_TOP_BAR** : Common position of the upper edge of "top" hotizontal strokes without any stroke above or touching its upper edge. Like the position of the first horizontal stroke in “里”.
  * **BLUEZONE_BOTTOM_BAR** : Common position of the lower edge of "bottom" hotizontal strokes without any stroke below or touching its lower edge. Like the position of the lowest horizontal stroke in “里”.
  * **BLUEZONE_TOP_DOTBAR** : Common position of the upper edge of "top" hotizontal strokes with stroke touching its upper edge. Like the position of the first horizontal stroke in “章”.
  * **BLUEZONE_BOTTOM_DOTBAR** : Common position of the lower edge of "bottom" hotizontal strokes with stroke touching its upper edge.
  * **gears** : Stroke width allocation strategy. It is an array like `[[0,1,1],[20,2,1],[22,2,2]]`, each item is a triplet: ppem, common width (in pixels) and minimum width. The term `[20,2,1]` stands for “for sizes being 20,21px, most strokes are 2 pixels wide, though some thin strokes will be 1 pixel wide, even if the space below or undef is enough”.

* **Stem Detection Parameters**

  * **MIN_STEM_WIDTH** and **MAX_STEM_WIDTH** : Minimum and maximum of stem width
  * **MOST_COMMON_STEM_WIDTH** : The common stem width
  * **STEM_SIDE_MIN_RISE** : The maximum height of decorative shapes placed aside a hotizontal stem's upper edge.
  * **STEM_SIDE_MIN_DESCENT** : The maximum depth of close decorative shapes placed aside a hotizontal stem's lower edge.
  * **STEM_CENTER_MIN_RISE** : The maximum height of close decorative shapes placed above a hotizontal stem's upper edge.
  * **STEM_CENTER_MIN_DESCENT** : The maximum depth of decorative shapes placed below a hotizontal stem's lower edge.
  * **STEM_SIDE_MIN_DIST_RISE** : The maximum height of distanced decorative shapes placed aside a hotizontal stem's upper edge.
  * **STEM_SIDE_MIN_DIST_DESCENT** : The maximum depth of distanced decorative shapes placed aside a hotizontal stem's lower edge.

* **Parameters for building composite font**

  * **CVT_PADDING** : While `hans.sfd` contains Han characters only, to build a composite font with Latin letters or Kanas, the hinted Han subfont should respect the original hintings contained by the non-Han part. This parameter indicates the length of the `cvt` table in the non-Han subfont, to avoid `cvt` conflict between Han and non-Han parts. To build a composite font you may follow this process:	

    ``` bash
    sah-applyhgi <instructions.hgi> <hans.sfd> -o <hans-hinted.sfd> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
    sah-applyhgi <instructions.hgi> <nonhan.sfd> -o <nonhan-patched.sfd> {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
    <merge han-hinted.sfd into nonhan-patched.sfd to create a composite font>
    ```

And there are some parameters for `hgfhint` only:

* **`-d divisor` and `-m modulo`**: Since `hgfhint` takes a lot of time, so we have a few extra parameters to help you out:

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

You can adjust these parameters using the `paramadj`:

``` bash
sah-paramadj hans.sfd -w "<test characters>" {--<STRATEGY_PARAMETER_NAME>=<STRATEGY_PARAMETER_VALUE>}
```

It will provide an interactive parameter adjustment utility accessable from `localhost:9527`.