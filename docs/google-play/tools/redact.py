"""Replace real names on an app screenshot with fictional ones.

usage: python3 redact.py <shot.png> <ui.xml> <mapping.json> <out.png>

mapping.json: [{"old": "<exact node text>", "new": "<replacement>"}, ...]
Every node of the uiautomator dump whose text equals `old` (or contains it,
when "contains": true) is located by its bounds; the ink of the original text
is measured, the font size and weight are fitted by rendering the original
text in the phone's own font (One UI Sans), the ink is painted over with the
background, and the replacement is drawn at the same baseline and colour.
Prints every replacement and every node it could not fit.
"""
import html
import json
import re
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[5] if len(sys.argv) > 5 else None
WEIGHTS = [400, 500, 600, 700, 800]


def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight])
    return f


def nodes(xml):
    x = open(xml, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
        t = html.unescape(m.group(1))
        if t:
            yield t, tuple(int(v) for v in m.groups()[1:])


def dist(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def ink_box(img, box, bg, thr=60):
    x0, y0, x1, y1 = box
    px = img.load()
    xs, ys, cols = [], [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            c = px[x, y]
            d = dist(c, bg)
            if d > thr:
                xs.append(x); ys.append(y); cols.append((d, c))
    if not xs:
        return None, None, 0
    cols.sort(reverse=True)
    top = [c for _, c in cols[: max(1, len(cols) // 5)]]
    colour = tuple(sorted(ch)[len(ch) // 2] for ch in zip(*top))
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1), colour, len(xs)


def render_ink(text, f):
    l, t, r, b = f.getbbox(text)
    w, h = r - l + 8, b - t + 8
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((4 - l, 4 - t), text, font=f, fill=255)
    bb = im.point(lambda v: 255 if v > 90 else 0).getbbox()
    cnt = sum(1 for v in im.tobytes() if v > 90)
    # offset from the draw origin (0,0) to the ink box top-left
    return (bb[0] - 4 + l, bb[1] - 4 + t), (bb[2] - bb[0], bb[3] - bb[1]), cnt


def fit(old, ink_w, ink_h, ink_cnt):
    best = None
    for w in WEIGHTS:
        size = 40
        for _ in range(6):
            _, (rw, rh), _ = render_ink(old, font(size, w))
            if rw == 0:
                break
            size = max(8, round(size * ink_w / rw))
        off, (rw, rh), cnt = render_ink(old, font(size, w))
        score = abs(rw - ink_w) / ink_w + abs(rh - ink_h) / max(ink_h, 1) + abs(cnt - ink_cnt) / max(ink_cnt, 1)
        if best is None or score < best[0]:
            best = (score, size, w, off)
    return best


def main():
    shot, xml, mapping_path, out = sys.argv[1:5]
    img = Image.open(shot).convert("RGB")
    mapping = json.load(open(mapping_path, encoding="utf-8"))
    draw = ImageDraw.Draw(img)
    done = set()
    fits = {}
    for text, (x0, y0, x1, y1) in nodes(xml):
        for m in mapping:
            hit = (m["old"] in text) if m.get("contains") else (text == m["old"])
            if not hit:
                continue
            new = text.replace(m["old"], m["new"]) if m.get("contains") else m["new"]
            region = img.crop((x0, y0, x1, y1))
            border = [region.getpixel((x, 0)) for x in range(region.width)] + \
                     [region.getpixel((x, region.height - 1)) for x in range(region.width)]
            bg = Counter(border).most_common(1)[0][0]
            box, colour, cnt = ink_box(img, (x0, y0, x1, y1), bg)
            if not box:
                print("NO INK", text); continue
            iw, ih = box[2] - box[0], box[3] - box[1]
            if m.get("like"):
                # Multi-line node: borrow size/weight from a single-line node of
                # the same style, align the new text's ink top to the old one.
                size, weight = fits[m["like"]]
                f = font(size, weight)
                off, _, _ = render_ink(new.split("\n")[0], f)
                score = 0
            else:
                score, size, weight, off = fit(text, iw, ih, cnt)
                fits[text] = (size, weight)
            if score > 0.6:
                print(f"POOR FIT {score:.2f}", text, box)
            pad = 3
            draw.rectangle((max(x0, box[0] - pad), max(y0, box[1] - pad), min(x1, box[2] + pad), min(y1, box[3] + pad)), fill=bg)
            f = font(size, weight)
            origin = (box[0] - off[0], box[1] - off[1])
            # Ink top of the new text may differ (no capitals / descenders), so
            # anchor on the baseline of the original instead of its ink top.
            asc_old = f.getbbox(text)[1]
            asc_new = f.getbbox(new)[1]
            for i, line in enumerate(new.split("\n")):
                draw.text((origin[0], origin[1] + i * m.get("line_h", 0)), line, font=f, fill=colour)
            nb = f.getbbox(max(new.split("\n"), key=len))
            right = origin[0] + nb[2]
            flag = " OVERFLOW" if right > x1 else ""
            print(f"{text!r} -> {new!r} size={size} w={weight} colour={colour} bg={bg}{flag}")
            done.add(text)
            break
    img.save(out)


if __name__ == "__main__":
    main()
