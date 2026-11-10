"""Pixel-Art-Banner für Neon Hop (2:1, 1600x800) mit Pixel-Schriftzug.
Aufruf: python3 banner.py <ausgabeordner>
"""
import random
import sys
from PIL import Image

W, H = 100, 50
SCALE = 16
OUT = sys.argv[1]

INK = (29, 20, 66)
SKY = [(0, (27, 12, 70)), (14, (58, 26, 140)), (28, (106, 60, 255))]
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
GOLD = (255, 216, 74)
GOLD_DARK = (200, 150, 0)
LOGO = (255, 224, 102)
LOGO_SHADE = (255, 183, 3)

img = Image.new('RGB', (W, H), SKY[0][1])
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


GROUND_Y = 38
for y in range(GROUND_Y):
    for x in range(W):
        c = SKY[0][1]
        for i, (start, col) in enumerate(SKY):
            if y >= start:
                c = col
                if i > 0 and y < start + 4 and (x + y) % 2 == 0:
                    c = SKY[i - 1][1]
        px[x, y] = c

random.seed(3)
for _ in range(40):
    x, y = random.randrange(W), random.randrange(24)
    put(x, y, STAR if random.random() < 0.4 else STAR_DIM)
for (x, y) in [(56, 4), (92, 6), (50, 12)]:
    put(x, y, STAR); put(x - 1, y, STAR_DIM); put(x + 1, y, STAR_DIM); put(x, y - 1, STAR_DIM); put(x, y + 1, STAR_DIM)

mx, my, r = 70, 9, 6
for y in range(my - r, my + r + 1):
    for x in range(mx - r, mx + r + 1):
        if (x - mx) ** 2 + (y - my) ** 2 <= r * r:
            put(x, y, MOON_SHADE if x > mx and (x - mx + 2) ** 2 + (y - my - 1) ** 2 > (r - 1) ** 2 else MOON)
for (x, y) in [(68, 7), (72, 11), (69, 12)]:
    put(x, y, MOON_SHADE)

for (x, y, s) in [(56, 20, 8), (78, 24, 6), (40, 22, 6), (6, 22, 7)]:
    outline(x, y, s, s, SQUARE)

# Boden
rect(0, GROUND_Y, W, H - GROUND_Y, GROUND)
for x in range(0, W, 10):
    for y in range(GROUND_Y + 2, H):
        put(x + 3, y, GROUND_LINE)
for y in range(GROUND_Y + 7, H, 2):
    for x in range(W):
        if (x + y) % 2 == 0:
            put(x, y, INK)
rect(0, GROUND_Y, W, 1, NEON)
rect(0, GROUND_Y + 1, W, 1, NEON_DARK)

T = 8


def block(x0, h_tiles, w_tiles):
    y0 = GROUND_Y - h_tiles * T
    rect(x0, y0, w_tiles * T, h_tiles * T, BLOCK)
    for i in range(w_tiles):
        for j in range(h_tiles):
            rect(x0 + i * T + 2, y0 + j * T + 2, T - 4, T - 4, BLOCK_IN)
    outline(x0, y0, w_tiles * T, h_tiles * T, NEON)


def spike(x):
    for row in range(8):
        half = (row + 1) // 2
        y = GROUND_Y - 8 + row
        cx = x + 4
        for xx in range(cx - half, cx + half):
            put(xx, y, SPIKE)
        put(cx - half - 1 if half else cx - 1, y, SPIKE_EDGE)
        put(cx + half, y, SPIKE_EDGE)
    put(x + 3, GROUND_Y - 8, SPIKE_EDGE)


block(66, 1, 1)
block(74, 2, 2)
block(91, 3, 1)
spike(40); spike(48); spike(56)

# Ring
ox, oy = 54, 19
for y in range(oy - 6, oy + 7):
    for x in range(ox - 6, ox + 7):
        d = (x - ox) ** 2 + (y - oy) ** 2
        if d <= 7:
            put(x, y, ORB)
        elif 24 <= d <= 34:
            put(x, y, ORB if (x + y) % 3 else ORB_HI)
put(ox - 1, oy - 1, ORB_HI); put(ox - 2, oy - 1, ORB_HI); put(ox - 1, oy - 2, ORB_HI)

# Münze über dem Turm
cxm, cym = 82, 16
for y in range(cym - 3, cym + 4):
    for x in range(cxm - 3, cxm + 4):
        d = (x - cxm) ** 2 + (y - cym) ** 2
        if d <= 10:
            put(x, y, GOLD)
        if 4 <= d <= 5:
            put(x, y, GOLD_DARK)
put(cxm - 1, cym - 2, ORB_HI)

# Spur + Würfel
for (x, y, s) in [(13, 33, 2), (17, 30, 2), (21, 27, 3), (25, 24, 3)]:
    for i in range(s):
        for j in range(s):
            if (x + i + y + j) % 2 == 0 or s == 3:
                put(x + i, y + j, NEON if s == 3 else NEON_DARK)
cx, cy = 29, 15
rect(cx, cy, 12, 12, INK)
rect(cx + 1, cy + 1, 10, 10, CUBE)
rect(cx + 2, cy + 2, 8, 8, INK)
rect(cx + 3, cy + 3, 6, 6, CUBE_IN)
for (ex, ey) in [(4, 4), (4, 5), (7, 4), (7, 5)]:
    put(cx + ex, cy + ey, INK)
put(cx + 5, cy + 7, INK); put(cx + 6, cy + 7, INK)
put(cx + 1, cy + 1, (220, 250, 255)); put(cx + 2, cy + 1, (180, 245, 255)); put(cx + 1, cy + 2, (180, 245, 255))
rect(cx + 1, cy + 10, 10, 1, NEON_DARK)

for (x, y) in [(44, 27), (47, 24), (62, 14), (65, 21)]:
    put(x, y, PINK)

# --- Schriftzug "NEON HOP" (5x7-Pixelschrift, Umriss + Schatten)
FONT = {
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
}
text = 'NEON HOP'
lx, ly = 5, 4
pixels = set()
x = lx
for ch in text:
    if ch == ' ':
        x += 4
        continue
    for j, row in enumerate(FONT[ch]):
        for i, bit in enumerate(row):
            if bit == '1':
                pixels.add((x + i, ly + j))
    x += 6
# Schatten (2 Pixel nach unten) und Umriss
for (a, b) in pixels:
    for (dx, dy) in [(0, 2), (1, 1)]:
        put(a + dx, b + dy, INK)
    for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        if (a + dx, b + dy) not in pixels:
            put(a + dx, b + dy, INK)
for (a, b) in pixels:
    put(a, b, LOGO_SHADE if b - ly >= 5 else LOGO)

img.save(f'{OUT}/banner-klein.png')
big = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
big.save(f'{OUT}/Neon-Hop-Banner.png', optimize=True)
print('gespeichert', big.size)
