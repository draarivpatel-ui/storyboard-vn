# The Glass Meridian

**The Glass Meridian** is a branching visual novel in six scenes and four endings, created for Hack Club Storyboard. It is written in authentic Ren'Py 8 script (`game/script.rpy`) and ships with a zero-dependency JavaScript Ren'Py subset parser, deterministic story runtime, and narrative DAG reachability verifier (`engine.js`) so the exact same story runs both on the web and in the desktop Ren'Py 8 launcher.

Live Web Edition: `https://aariv.me/storyboard-vn/`

## Premise

Once a century, on the night of the Long Tide, the great Fresnel lens at the top of Meridian Point has to be calibrated against the stars. If it is not, every tide table along the coast drifts until a ship finds a rock. You arrive as the new apprentice three nights before the Long Tide, with a storm rolling in a day early and three keepers who each remember how you treat them:

- **Mira**, the current tower keeper, who judges you by whether you help with the unglamorous work before asking for the glass.
- **Archivist Voss**, who guards the vault key and the century-old ledger recording how Keeper Aldous cracked the lens by rushing.
- **Soren**, an instrument maker from the mainland guild, caught between an honest prism seat and an urgent guild invoice.

Your choices across six scenes shift three core variables (`trust_score`, `calibration_drift`, and `lens_unlocked`), plus narrative flags (`ledger_read`, `asked_failure`, `accord_signed`, `tide_entries`), leading to one of four endings:

1. **Meridian Restored** (`ending_meridian_restored`): The lens is calibrated by the book with steady hands and high trust.
2. **Silent Observatory** (`ending_silent_observatory`): The lens stays dark and the harbor learns to read the water directly.
3. **Tidal Accord** (`ending_tidal_accord`): The harbor and the instrument guild sign a shared calibration table half a degree off true.
4. **Glass Fracture** (`ending_glass_fracture`): Accumulated shortcuts pull the calibration off true until the glass splits on the first full moon.

## Dual Runtime Architecture

This repository is structured as both a valid Ren'Py 8 desktop project and a static web application:

- **Desktop Ren'Py 8 (`game/`)**: Open the repository folder in the Ren'Py 8 Launcher and click **Launch Project**. It uses `game/script.rpy`, `game/screens.rpy`, `game/options.rpy`, `game/gui.rpy`, and the 18 vector assets in `game/images/`.
- **Browser Runtime (`index.html`, `engine.js`, `app.js`, `styles.css`)**: Parses `game/script.rpy` directly in JavaScript without `eval()`, executing `define`, `default`, `image`, `label`, `scene`, `show`, `hide`, `with`, `menu` (with `if` guards), `$ var = expr` mutations, `if / elif / else` branches, `jump`, `call`, and `return`.
- **Script & DAG Inspector**: Built into the web interface. Performs static control-flow analysis, Tarjan strongly connected component cycle detection, and breadth-first state-space exploration over `game/script.rpy` (or any custom Ren'Py script you type into the live editor) to prove that all labels and endings are reachable and to compute the shortest choice sequence to each ending.

## Features in the Browser Edition

- **Playable Proscenium Stage**: 16:9 stage with 6 layered SVG backgrounds (`bg_harbor`, `bg_archive`, `bg_workshop`, `bg_storm`, `bg_lens`, `bg_dawn`), atmospheric lighting and weather animations, pointer parallax, and 3 characters (`mira`, `soren`, `voss`) each composited from body and expression layers (`calm`, `worried`, `smile`, `guarded`, `smirk`, `open`, `stern`, `soft`, `grave`).
- **Full VN Controls**: Step-back rollback across dialogue and choices, scrollable dialogue backlog, 6 browser save/load slots, auto-advance, seen/unseen skip mode, configurable typewriter speed, and keyboard shortcuts (`Space` / `Enter` / `Right` to advance, `Left` / `Backspace` to roll back, `1-9` to pick a choice, `H` backlog, `M` narrative map, `A` auto, `S` skip, `Escape` menu).
- **Live Narrative Map Drawer**: Displays live gauges for `trust_score`, `calibration_drift`, and `lens_unlocked` alongside an interactive SVG directed acyclic graph highlighting visited labels, taken edges, and guard conditions.
- **Ending Gallery**: Tracks discovered endings in `localStorage` (`persistent.ending_*`) and displays verified shortest choice routes for every ending.

## Running Locally

### 1. Run the test suite

Requires Node.js 18+:

```bash
npm test
```

This runs 66 unit and DOM smoke tests (`tests/engine.test.js` and `tests/dom-smoke.test.js`) via `node --test`.

### 2. Play in a browser

Serve the repository root with any static HTTP server (or open `index.html` directly):

```bash
npx serve .
```

If you edit `game/script.rpy` and want `index.html` to include your updated script when opened via `file://`, regenerate the bundle:

```bash
npm run build:bundle
```

To regenerate the 18 SVG backgrounds and character expression layers from source:

```bash
npm run build:art
```

### 3. Play in Desktop Ren'Py 8

Open the Ren'Py 8 SDK launcher, add this repository's directory as a project, and launch **The Glass Meridian**. You can also run the automated Ren'Py UI test suite defined in `game/tests.rpy`:

```bash
/path/to/renpy.sh /path/to/storyboard-vn test meridian_restored
```

## License

Released under the [MIT License](LICENSE). See [NOTES.md](NOTES.md) for architecture notes and development disclosures.
