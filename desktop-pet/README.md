# Desktop pet

A little animated cat that lives on top of your Windows taskbar. It sits, wanders around,
reacts when you click it, and can be picked up and dropped (it falls back down).

| Do this | What happens |
|---|---|
| Left-click the pet | It reacts (meows / licks its paw) |
| Left-click and drag | Pick it up; let go and it drops back to the taskbar |
| Right-click | Menu: turn **Walk around** on/off, or **Quit** |

## Setup (Windows)

1. Install Python from <https://www.python.org/downloads/>. In the installer, tick
   **Add python.exe to PATH**.
2. Open **Command Prompt** and install Pillow (the image library the pet uses):
   ```
   py -m pip install pillow
   ```
3. Save your sprite sheet as `desktop-pet\sprites\cat.png`.
4. Double-click `pet.pyw`. The pet appears at the bottom of your screen.

If double-clicking does nothing, open Command Prompt in the `desktop-pet` folder and run
`py pet.pyw`. Any error then shows up in that window.

**Start it with Windows (optional):** press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup`, press
Enter, and put a shortcut to `pet.pyw` in the folder that opens.

## The sprite sheet

`config.json` is set up for a Stardew Valley–style pet sheet: **4 columns × 8 rows**, with the cat
facing right in the walking row. Rows and frames are counted from **0** (the top row is row 0,
the left frame is frame 0).

| Animation | Where on the sheet | Used when |
|---|---|---|
| `idle` | row 4, frames 2–3 (sitting, tail flick) | standing still |
| `walk` | row 1, frames 0–3 (walking right; mirrored for left) | wandering |
| `react` | row 5, frames 0–3 (meow, lick paw) | you click it |
| `drag` | row 7, frames 2–3 (stretched out) | you're holding it or it's falling |

Only `idle` is required. If an animation is missing, the pet uses `idle` instead (and `fall` uses
`drag`). You can add a separate `fall` animation the same way.

The sheet can be the original small file or a bigger copy. If it has a plain white (or other solid)
background instead of a see-through one, the background is removed automatically.

## config.json settings

| Setting | Meaning |
|---|---|
| `sprite_sheet` | Path to the image, relative to this folder |
| `columns`, `rows` | How many frames across and down the sheet has |
| `size` | Height of the pet on screen, in pixels (96 = 3× a 32-pixel sprite) |
| `sprite_faces` | Which way the cat faces on the sheet: `"right"` or `"left"` |
| `walk_around` | `true` to wander, `false` to stay put (also in the right-click menu) |
| `walk_speed` | Walking speed in pixels per second |
| `idle_seconds` | `[min, max]` seconds to sit still between walks |
| `animations` | Each has `row`, `frames`, optional `start` (first frame, default 0), `frame_ms` (time per frame) and `loops` (how many times `react` plays) |

## Limits

- It walks on your main screen. Drop it on another monitor and it hops back to the main one.
- Pixels that are only partly see-through (like a soft shadow) are shown either fully or not at all.
- Sprite images in `sprites/` are ignored by git so game art doesn't get uploaded to GitHub.
