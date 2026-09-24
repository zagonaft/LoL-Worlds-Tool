"""Desktop pet: an animated sprite that lives on top of your Windows taskbar.

  Left-click          pet it
  Left-click + drag   pick it up and drop it
  Right-click         menu (walk around on/off, quit)

The sprite sheet and its animations are set up in config.json.
Double-click this file to run it without a console window.
"""

import json
import random
import sys
import time
import traceback
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

APP_NAME = "Desktop pet"
HERE = Path(__file__).resolve().parent

# Windows makes every pixel of exactly this color see-through (and click-through).
KEY_COLOR = "#ff00fe"
KEY_RGB = (255, 0, 254)

TICK_MS = 16            # how often the pet updates (about 60 times a second)
GRAVITY = 2400          # how fast a dropped pet falls, in pixels per second²
DRAG_THRESHOLD = 4      # pixels the mouse must move before a click counts as a drag
MIN_WALK_DISTANCE = 80  # shortest walk, in pixels

# When the sprite sheet has no animation for a state, use the first one it does have.
FALLBACKS = {
    "walk": ["idle"],
    "react": ["idle"],
    "drag": ["idle"],
    "fall": ["drag", "idle"],
}

DEFAULTS = {
    "size": 96,
    "sprite_faces": "right",
    "walk_around": True,
    "walk_speed": 90,
    "idle_seconds": [3, 8],
}


class PetError(Exception):
    """A problem the user can fix, usually in config.json."""


def show_error(message):
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(APP_NAME, message)
    root.destroy()


try:
    from PIL import Image, ImageDraw, ImageOps, ImageTk
except ImportError:
    show_error("The pet needs the Pillow library.\n\n"
               "Open a terminal (Command Prompt) and run:\n\n    pip install pillow")
    sys.exit(1)


def make_dpi_aware():
    """Stop Windows from blurring the pixel art on scaled (125%, 150%...) displays."""
    if sys.platform != "win32":
        return
    import ctypes
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except (AttributeError, OSError):
            pass


def work_area(root):
    """The part of the main screen not covered by the taskbar: (left, top, right, bottom)."""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes
        rect = wintypes.RECT()
        SPI_GETWORKAREA = 0x0030
        if ctypes.windll.user32.SystemParametersInfoW(SPI_GETWORKAREA, 0, ctypes.byref(rect), 0):
            return rect.left, rect.top, rect.right, rect.bottom
    return 0, 0, root.winfo_screenwidth(), root.winfo_screenheight()


def load_config():
    path = HERE / "config.json"
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise PetError(f"Couldn't find config.json in {HERE}")
    except json.JSONDecodeError as err:
        raise PetError(f"config.json has a mistake on line {err.lineno}: {err.msg}")
    for key in ("sprite_sheet", "columns", "rows", "animations"):
        if key not in cfg:
            raise PetError(f'config.json is missing "{key}".')
    if "idle" not in cfg["animations"]:
        raise PetError('config.json needs an "idle" animation.')
    return {**DEFAULTS, **cfg}


def remove_background(sheet):
    """For sheets saved without transparency (e.g. on white), clear the background around the sprites."""
    if sheet.getchannel("A").getextrema()[0] < 255:
        return  # already has see-through pixels
    w, h = sheet.size
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if sheet.getpixel(corner)[3] != 0:
            ImageDraw.floodfill(sheet, corner, (0, 0, 0, 0), thresh=60)


def to_photo(frame):
    """Flatten a frame onto KEY_COLOR so its see-through pixels become see-through on screen."""
    solid = frame.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    flat = Image.new("RGB", frame.size, KEY_RGB)
    flat.paste(frame.convert("RGB"), mask=solid)
    return ImageTk.PhotoImage(flat)


def load_animations(cfg):
    """Cut every animation out of the sprite sheet, in both facing directions."""
    path = HERE / cfg["sprite_sheet"]
    try:
        sheet = Image.open(path).convert("RGBA")
    except FileNotFoundError:
        raise PetError(f"Couldn't find the sprite sheet:\n{path}\n\n"
                       'Put your sprite sheet there, or change "sprite_sheet" in config.json.')
    remove_background(sheet)

    columns, rows = int(cfg["columns"]), int(cfg["rows"])
    frame_w, frame_h = sheet.width / columns, sheet.height / rows
    out_h = int(cfg["size"])
    out_w = max(1, round(out_h * frame_w / frame_h))

    animations = {}
    for name, spec in cfg["animations"].items():
        try:
            row, count = int(spec["row"]), int(spec["frames"])
        except KeyError as err:
            raise PetError(f'The "{name}" animation in config.json needs a "{err.args[0]}" value.')
        start = int(spec.get("start", 0))

        if row >= rows or start + count > columns:
            raise PetError(
                f'The "{name}" animation in config.json goes past the edge of the sprite sheet '
                f"(row {row}, frames {start} to {start + count - 1}).\n\n"
                f"The sheet has rows 0 to {rows - 1} and frames 0 to {columns - 1}.")

        normal, mirrored = [], []
        for col in range(start, start + count):
            box = (round(col * frame_w), round(row * frame_h),
                   round((col + 1) * frame_w), round((row + 1) * frame_h))
            frame = sheet.crop(box).resize((out_w, out_h), Image.NEAREST)
            normal.append(to_photo(frame))
            mirrored.append(to_photo(ImageOps.mirror(frame)))

        if cfg["sprite_faces"] == "left":
            normal, mirrored = mirrored, normal
        animations[name] = {
            "right": normal,
            "left": mirrored,
            "frame_ms": max(1, int(spec.get("frame_ms", 150))),
            "loops": max(1, int(spec.get("loops", 1))),
        }
    return animations


class Pet:
    def __init__(self, root, cfg, animations):
        self.root = root
        self.cfg = cfg
        self.animations = animations
        first_frame = animations["idle"]["right"][0]
        self.width, self.height = first_frame.width(), first_frame.height()

        self.label = tk.Label(root, bg=KEY_COLOR, bd=0, highlightthickness=0)
        self.label.pack()
        self.label.bind("<ButtonPress-1>", self.on_press)
        self.label.bind("<B1-Motion>", self.on_drag)
        self.label.bind("<ButtonRelease-1>", self.on_release)
        self.label.bind("<Button-3>", self.show_menu)

        self.walk_around = tk.BooleanVar(value=cfg["walk_around"])
        self.menu = tk.Menu(root, tearoff=False)
        self.menu.add_checkbutton(label="Walk around", variable=self.walk_around)
        self.menu.add_separator()
        self.menu.add_command(label="Quit", command=root.destroy)

        self.area = work_area(root)
        left, _, right, _ = self.area
        self.x = random.randint(left, max(left, right - self.width))
        self.y = self.floor_y()
        self.facing = "right"
        self.target_x = self.x
        self.fall_speed = 0.0
        self.press = None
        self.grab = (0, 0)
        self.dragging = False
        self.shown_image = None
        self.shown_pos = None

        self.set_state("idle")
        self.last_tick = time.monotonic()
        self.tick()

    # --- states: idle, walk, react, drag, fall ---

    def set_state(self, state):
        self.state = state
        self.state_time = 0.0
        self.frame = 0
        self.frame_time = 0.0
        if state == "idle":
            low, high = self.cfg["idle_seconds"]
            self.idle_for = random.uniform(low, high)

    def animation(self):
        for name in [self.state] + FALLBACKS.get(self.state, []):
            if name in self.animations:
                return self.animations[name]
        return self.animations["idle"]

    def floor_y(self):
        return self.area[3] - self.height

    def start_walk(self):
        self.area = work_area(self.root)  # the taskbar or screen size may have changed
        left, _, right, _ = self.area
        max_x = right - self.width
        self.x = min(max(self.x, left), max_x)
        self.y = self.floor_y()
        if max_x - left < MIN_WALK_DISTANCE:
            self.set_state("idle")
            return
        target = self.x
        while abs(target - self.x) < MIN_WALK_DISTANCE:
            target = random.randint(left, max_x)
        self.target_x = target
        self.facing = "right" if target > self.x else "left"
        self.set_state("walk")

    # --- main loop ---

    def tick(self):
        now = time.monotonic()
        dt = min(now - self.last_tick, 0.1)
        self.last_tick = now
        self.state_time += dt

        self.update(dt)
        self.animate(dt)

        pos = (round(self.x), round(self.y))
        if pos != self.shown_pos:
            self.root.geometry(f"+{pos[0]}+{pos[1]}")
            self.shown_pos = pos
        self.root.after(TICK_MS, self.tick)

    def update(self, dt):
        if self.state == "idle":
            if self.walk_around.get() and self.state_time >= self.idle_for:
                if random.random() < 0.7:
                    self.start_walk()
                else:
                    self.set_state("idle")  # stay put a bit longer

        elif self.state == "walk":
            if not self.walk_around.get():
                self.set_state("idle")
                return
            step = self.cfg["walk_speed"] * dt
            distance = self.target_x - self.x
            if abs(distance) <= step:
                self.x = self.target_x
                self.set_state("idle")
            else:
                self.x += step if distance > 0 else -step

        elif self.state == "react":
            anim = self.animation()
            length_ms = len(anim["right"]) * anim["frame_ms"] * anim["loops"]
            if self.state_time * 1000 >= length_ms:
                self.set_state("idle")

        elif self.state == "fall":
            self.fall_speed += GRAVITY * dt
            self.y += self.fall_speed * dt
            if self.y >= self.floor_y():
                self.y = self.floor_y()
                self.set_state("idle")

    def animate(self, dt):
        anim = self.animation()
        frames = anim[self.facing]
        self.frame_time += dt * 1000
        while self.frame_time >= anim["frame_ms"]:
            self.frame_time -= anim["frame_ms"]
            self.frame = (self.frame + 1) % len(frames)
        image = frames[self.frame % len(frames)]
        if image is not self.shown_image:
            self.label.configure(image=image)
            self.shown_image = image

    # --- mouse ---

    def on_press(self, event):
        self.press = (event.x_root, event.y_root)
        self.grab = (event.x_root - self.x, event.y_root - self.y)
        self.dragging = False

    def on_drag(self, event):
        if self.press is None:
            return
        if not self.dragging:
            moved = abs(event.x_root - self.press[0]) + abs(event.y_root - self.press[1])
            if moved < DRAG_THRESHOLD:
                return
            self.dragging = True
            self.set_state("drag")
        self.x = event.x_root - self.grab[0]
        self.y = event.y_root - self.grab[1]

    def on_release(self, event):
        if self.press is None:
            return
        self.press = None
        if not self.dragging:
            if self.state != "fall":
                self.set_state("react")
            return

        self.dragging = False
        self.area = work_area(self.root)
        left, _, right, _ = self.area
        self.x = min(max(self.x, left), right - self.width)
        if self.y < self.floor_y():
            self.fall_speed = 0.0
            self.set_state("fall")
        else:
            self.y = self.floor_y()
            self.set_state("idle")

    def show_menu(self, event):
        try:
            self.menu.tk_popup(event.x_root, event.y_root)
        finally:
            self.menu.grab_release()


def main():
    make_dpi_aware()
    root = tk.Tk()
    root.withdraw()
    root.title(APP_NAME)

    try:
        cfg = load_config()
        animations = load_animations(cfg)
    except PetError as err:
        messagebox.showerror(APP_NAME, str(err), parent=root)
        root.destroy()
        return
    except Exception:
        messagebox.showerror(APP_NAME, "Couldn't load the pet:\n\n" + traceback.format_exc(limit=2),
                             parent=root)
        root.destroy()
        return

    # Without a console window an error would otherwise freeze the pet silently.
    def report_error(exc_type, exc, tb):
        messagebox.showerror(APP_NAME, "The pet ran into a problem:\n\n"
                             + "".join(traceback.format_exception(exc_type, exc, tb, limit=3)))
        root.destroy()
    root.report_callback_exception = report_error

    root.overrideredirect(True)  # no title bar or border
    root.attributes("-topmost", True)
    root.configure(bg=KEY_COLOR)
    if sys.platform == "win32":
        root.attributes("-transparentcolor", KEY_COLOR)

    Pet(root, cfg, animations)
    root.deiconify()
    root.mainloop()


if __name__ == "__main__":
    main()
