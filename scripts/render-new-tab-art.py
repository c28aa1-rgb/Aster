"""Render Aster's still Lunar Daybreak illustration. Requires Pillow and NumPy."""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
W, H = 2400, 1500
rng = np.random.default_rng(27)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
t = np.clip((yy / H - .28) / .72, 0, 1)[..., None]
sky = np.array([243, 247, 248]) * (1 - t) + np.array([213, 229, 235]) * t
sky = np.broadcast_to(sky, (H, W, 3)).copy()
glow = np.exp(-(((xx - 600) / 1050) ** 2 + ((yy - 890) / 650) ** 2))[..., None]
sky = sky * (1 - glow * .45) + np.array([249, 250, 251]) * glow * .45
canvas = Image.fromarray(np.uint8(np.clip(sky, 0, 255)), "RGB").convert("RGBA")

# A pale curved horizon keeps the bottom of the image grounded.
horizon = Image.new("RGBA", (W, H))
hd = ImageDraw.Draw(horizon)
hd.ellipse((-1300, 1270, 2750, 4300), fill=(236, 242, 246, 135), outline=(255, 255, 255, 170), width=2)
canvas = Image.alpha_composite(canvas, horizon)

def sphere(cx, cy, radius, pale=False):
    size = radius * 2 + 4
    sy, sx = np.mgrid[0:size, 0:size].astype(np.float32)
    nx, ny = (sx - size / 2) / radius, (sy - size / 2) / radius
    r2 = nx * nx + ny * ny
    nz = np.sqrt(np.clip(1 - r2, 0, 1))
    noise = np.zeros((size, size), dtype=np.float32)
    for cells, amplitude in [(7, .46), (17, .25), (45, .14), (110, .07)]:
        field = Image.fromarray(np.uint8(rng.random((cells, cells)) * 255))
        noise += (np.asarray(field.resize((size, size), Image.Resampling.BICUBIC)) / 255 - .5) * amplitude
    bands = np.sin(ny * 18 + nx * 2 + noise * 11 + nz * 2) * .09
    lighting = np.clip(-nx * .52 - ny * .57 + nz * .64, 0, 1)
    texture = np.clip(.53 + noise + bands, 0, 1)
    dark = np.array([41, 75, 83] if not pale else [123, 142, 155])
    light = np.array([190, 220, 217] if not pale else [235, 239, 246])
    surface = dark + (light - dark) * texture[..., None]
    rgb = surface * (.28 + .85 * lighting[..., None])
    rim = (1 - nz) ** 7 * .38
    rgb = rgb * (1 - rim[..., None]) + np.array([195, 218, 230]) * rim[..., None]
    alpha = np.clip((1 - np.sqrt(r2)) * radius, 0, 1) * 255
    pixels = np.dstack((np.clip(rgb, 0, 255), alpha)).astype(np.uint8)
    canvas.alpha_composite(Image.fromarray(pixels), (int(cx - size / 2), int(cy - size / 2)))

cx, cy, radius = 1835, 1088, 262
angle = math.radians(-24)

def ring(front):
    layer = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(layer)
    # Thin bands, with a clear central division; front/back are separately occluded.
    for offset in range(0, 67, 2):
        a, b = 470 + offset, 114 + offset * .245
        color = (122, 148, 161, 95) if offset < 34 else (180, 180, 202, 135)
        if 34 <= offset <= 43:
            continue
        theta = np.linspace(0 if front else math.pi, math.pi if front else math.pi * 2, 800)
        x = a * np.cos(theta)
        y = b * np.sin(theta)
        points = list(zip(cx + x * math.cos(angle) - y * math.sin(angle), cy + x * math.sin(angle) + y * math.cos(angle)))
        draw.line(points, fill=color, width=2)
    return layer

canvas = Image.alpha_composite(canvas, ring(False))
sphere(cx, cy, radius)
canvas = Image.alpha_composite(canvas, ring(True))
sphere(1260, 1250, 39, pale=True)

# A few distant points give scale without surrounding the search area with decoration.
stars = Image.new("RGBA", (W, H))
draw = ImageDraw.Draw(stars)
for x, y, r in [(2140, 680, 2), (1530, 880, 1.6), (630, 1060, 1.5), (2240, 1180, 1.2), (190, 1280, 1.5), (1040, 1120, 1)]:
    draw.ellipse((x-r, y-r, x+r, y+r), fill=(101, 135, 150, 130))
canvas = Image.alpha_composite(canvas, stars)
output = ROOT / "public/assets/lunar-daybreak.png"
canvas.convert("RGB").save(output, optimize=True)
print(output)
