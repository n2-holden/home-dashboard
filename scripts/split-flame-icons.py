from pathlib import Path

from PIL import Image

src = Path(
    r"C:\Users\HoldenCaine\.cursor\projects\c-Users-HoldenCaine-Projects-home-dashboard"
    r"\assets\c__Users_HoldenCaine_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"4537c2c69152fcda6ef10acc4bd31e29_images_image-5c75d5d4-4a3c-4116-b6db-67f2bddaadc1.png"
)
im = Image.open(src).convert("RGBA")
w, h = im.size
bg = im.getpixel((2, 2))
print("size", im.size, "bg", bg)

content = [False] * w
for x in range(w):
    for y in range(h):
        p = im.getpixel((x, y))
        if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > 40:
            content[x] = True
            break

runs: list[tuple[int, int]] = []
start = None
for x, c in enumerate(content):
    if c and start is None:
        start = x
    if not c and start is not None:
        runs.append((start, x - 1))
        start = None
if start is not None:
    runs.append((start, w - 1))
print("runs", runs)

out = Path(__file__).resolve().parents[1] / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)


def extract(run: tuple[int, int], name: str) -> None:
    x0, x1 = run
    pad = 4
    x0 = max(0, x0 - pad)
    x1 = min(w - 1, x1 + pad)
    ys: list[int] = []
    for x in range(x0, x1 + 1):
        for y in range(h):
            p = im.getpixel((x, y))
            if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > 40:
                ys.append(y)
    y0 = max(0, min(ys) - pad)
    y1 = min(h - 1, max(ys) + pad)
    crop = im.crop((x0, y0, x1 + 1, y1 + 1))
    pixels = crop.load()
    cw, ch = crop.size
    for x in range(cw):
        for y in range(ch):
            p = pixels[x, y]
            if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) < 35:
                pixels[x, y] = (0, 0, 0, 0)
    side = max(cw, ch)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - cw) // 2, (side - ch) // 2), crop)
    final = canvas.resize((128, 128), Image.Resampling.LANCZOS)
    path = out / name
    final.save(path)
    print("wrote", path, final.size)


extract(runs[0], "flame-on.png")
extract(runs[1], "flame-off.png")
