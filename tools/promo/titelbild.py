"""Pixel-Art-Titelbild für Neon Hop (4:3, im Stil der Toki-Vorlagen).

Wird in 80x60 Pixeln gezeichnet und dann scharf (ohne Glätten) vergrössert.
Aufruf: python3 pixelart.py <ausgabeordner>
"""
import random
import sys
from PIL import Image

W, H = 80, 60
SCALE = 16
OUT = sys.argv[1]

INK = (29, 20, 66)
SKY_TOP = (27, 12, 70)
SKY_MID = (58, 26, 140)
SKY_LOW = (106, 60, 255)
STAR = (220, 214, 255)
STAR_DIM = (150, 130, 230)
SQUARE = (82, 48, 175)
GROUND = (32, 18, 80)
GROUND_LINE = (46, 28, 104)
NEON = (94, 230, 255)
NEON_DARK = (40, 150, 200)
BLOCK = (24, 14, 58)
BLOCK_IN = (38, 24, 86)
SPIKE = (10, 8, 26)
SPIKE_EDGE = (190, 230, 255)
CUBE = (94, 230, 255)
CUBE_IN = (255, 239, 94)
ORB = (255, 225, 74)
ORB_HI = (255, 250, 210)
MOON = (255, 240, 170)
MOON_SHADE = (240, 200, 110)
PINK = (255, 94, 200)

img = Image.new('RGB', (W, H), SKY_TOP)
px = img.load()


def put(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        px[x, y] = c


def rect(x, y, w, h, c):
    for i in range(w):
        for j in range(h):
            put(x + i, y + j, c)


def outline(x, y, w, h, c):
    for i in range(w):
        put(x + i, y, c); put(x + i, y + h - 1, c)
    for j in range(h):
        put(x, y + j, c); put(x + w - 1, y + j, c)


# --- Himmel: Farbstufen mit Schachbrett-Raster (Dithering) dazwischen
GROUND_Y = 46
bands = [(0, SKY_TOP), (16, SKY_MID), (34, SKY_LOW)]
for y in range(GROUND_Y):
    for x in range(W):
        c = bands[0][1]
        for i, (start, col) in enumerate(bands):
            if y >= start:
                c = col
                # 4 Zeilen Übergang mit Raster
                if i > 0 and y < start + 4 and (x + y) % 2 == 0:
                    c = bands[i - 1][1]
        px[x, y] = c

# --- Sterne
random.seed(8)
for _ in range(34):
    x, y = random.randrange(W), random.randrange(26)
    put(x, y, STAR if random.random() < 0.4 else STAR_DIM)
for (x, y) in [(10, 5), (47, 9), (30, 3)]:  # kleine Kreuz-Sterne
    put(x, y, STAR); put(x - 1, y, STAR_DIM); put(x + 1, y, STAR_DIM); put(x, y - 1, STAR_DIM); put(x, y + 1, STAR_DIM)

# --- Mond
mx, my, r = 66, 11, 6
for y in range(my - r, my + r + 1):
    for x in range(mx - r, mx + r + 1):
        d = (x - mx) ** 2 + (y - my) ** 2
        if d <= r * r:
            put(x, y, MOON_SHADE if (x - mx + 2) ** 2 + (y - my - 1) ** 2 > (r - 1) ** 2 and x > mx else MOON)
for (x, y) in [(64, 9), (68, 13), (65, 14)]:
    put(x, y, MOON_SHADE)

# --- Hintergrund-Quadrate (wie im Spiel)
for (x, y, s) in [(4, 14, 10), (34, 18, 7), (46, 28, 9), (72, 26, 6), (22, 6, 5)]:
    outline(x, y, s, s, SQUARE)

# --- Boden
rect(0, GROUND_Y, W, H - GROUND_Y, GROUND)
for x in range(0, W, 10):
    for y in range(GROUND_Y + 2, H):
        put(x + 3, y, GROUND_LINE)
for y in range(GROUND_Y + 8, H, 2):  # nach unten dunkler (Raster)
    for x in range(W):
        if (x + y) % 2 == 0:
            put(x, y, INK)
rect(0, GROUND_Y, W, 1, NEON)
rect(0, GROUND_Y + 1, W, 1, NEON_DARK)

T = 8  # Kachelgrösse


def block(tx, ty_from_ground, w_tiles, h_tiles):
    x0 = tx
    y0 = GROUND_Y - h_tiles * T - ty_from_ground * T
    w, h = w_tiles * T, h_tiles * T
    rect(x0, y0, w, h, BLOCK)
    for i in range(w_tiles):
        for j in range(h_tiles):
            rect(x0 + i * T + 2, y0 + j * T + 2, T - 4, T - 4, BLOCK_IN)
    outline(x0, y0, w, h, NEON)


def spike(x, y_base, size=8):
    for row in range(size):
        half = (row + 1) // 2 if size == 8 else row // 2
        y = y_base - size + row
        cx = x + size // 2
        for xx in range(cx - half, cx + half):
            put(xx, y, SPIKE)
        put(cx - half - 1 if half else cx - 1, y, SPIKE_EDGE)
        put(cx + half, y, SPIKE_EDGE)
    put(x + size // 2 - 1, y_base - size, SPIKE_EDGE)


# --- Blöcke rechts (Treppe)
block(56, 0, 1, 1)
block(64, 0, 2, 2)

# --- Stacheln
spike(30, GROUND_Y)
spike(38, GROUND_Y)
spike(46, GROUND_Y)

# --- Gelber Ring: Kugel mit Glanz + Ring mit Abstand
ox, oy = 45, 19
for y in range(oy - 6, oy + 7):
    for x in range(ox - 6, ox + 7):
        d = (x - ox) ** 2 + (y - oy) ** 2
        if d <= 7:
            put(x, y, ORB)
        elif 24 <= d <= 34:
            put(x, y, ORB if (x + y) % 3 else ORB_HI)
put(ox - 1, oy - 1, ORB_HI); put(ox - 2, oy - 1, ORB_HI); put(ox - 1, oy - 2, ORB_HI)

# --- Spur hinter dem Würfel
for (x, y, s) in [(3, 38, 2), (7, 35, 2), (11, 32, 3), (15, 29, 3)]:
    for i in range(s):
        for j in range(s):
            if (x + i + y + j) % 2 == 0 or s == 3:
                put(x + i, y + j, NEON if s == 3 else NEON_DARK)

# --- Spieler-Würfel 12x12: Umriss, Türkis, gelbes Innenfeld mit Gesicht
cx, cy = 19, 20
rect(cx, cy, 12, 12, INK)
rect(cx + 1, cy + 1, 10, 10, CUBE)
rect(cx + 2, cy + 2, 8, 8, INK)
rect(cx + 3, cy + 3, 6, 6, CUBE_IN)
for (ex, ey) in [(4, 4), (4, 5), (7, 4), (7, 5)]:      # Augen
    put(cx + ex, cy + ey, INK)
put(cx + 5, cy + 7, INK); put(cx + 6, cy + 7, INK)     # Mund
put(cx + 4, cy + 7, INK if False else CUBE_IN)
put(cx + 1, cy + 1, (220, 250, 255)); put(cx + 2, cy + 1, (180, 245, 255)); put(cx + 1, cy + 2, (180, 245, 255))
rect(cx + 1, cy + 10, 10, 1, NEON_DARK)               # Schatten unten

# --- kleine Funken
for (x, y) in [(33, 30), (36, 27), (52, 16), (55, 22)]:
    put(x, y, PINK)

img.save(f'{OUT}/titelbild-klein.png')
big = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
big.save(f'{OUT}/Neon-Hop-Titelbild.png', optimize=True)
print('gespeichert', big.size)
