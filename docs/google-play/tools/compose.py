"""Build Google Play graphics from redacted phone screenshots.

usage: python3 compose.py <shots_dir> <font.ttf> <icon-512.png> <out_dir>
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SHOTS, FONT, ICON, OUT = sys.argv[1:5]
GREEN = (6, 90, 73)
GREEN_DEEP = (4, 64, 52)
MINT = (226, 241, 236)
WHITE = (255, 255, 255)

# status bar above 110 px and the system navigation bar below 2183 px are
# dropped: Play refuses a side longer than twice the other (1080x2340 is 2.17)
CROP = (0, 110, 1080, 2183)

SET = [
    ("01-today", "a0.red.png", {
        "az": "Gün bir ekranda", "ru": "День на одном экране", "en": "Your day on one screen"}),
    ("02-route", "a2.red.png", {
        "az": "Marşrut nöqtə-nöqtə", "ru": "Маршрут по точкам", "en": "Your route, stop by stop"}),
    ("03-customers", "a3.red.png", {
        "az": "Həkimlər və müştərilər əlinizdə", "ru": "Врачи и клиенты под рукой", "en": "Doctors and customers at hand"}),
    ("04-calendar", "a1.png", {
        "az": "Ayın planı bir baxışda", "ru": "План месяца одним взглядом", "en": "The month's plan at a glance"}),
    ("05-more", "a5.png", {
        "az": "Müraciətlər, mesajlar, ziyarətlər", "ru": "Заявки, сообщения, визиты", "en": "Requests, messages, visits"}),
]


def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight])
    return f


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius, fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img, (0, 0), mask)
    return out


def gradient(w, h):
    bg = Image.new("RGB", (w, h), GREEN)
    top = Image.new("RGB", (w, h), GREEN_DEEP)
    mask = Image.linear_gradient("L").resize((w, h))
    return Image.composite(bg, top, mask)


def framed(shot, caption):
    W, H = 1080, 1920
    canvas = gradient(W, H).convert("RGBA")
    d = ImageDraw.Draw(canvas)
    f = font(66, 750)
    while d.textlength(caption, font=f) > W - 120:
        f = font(f.size - 2, 750)
    tw = d.textlength(caption, font=f)
    d.text(((W - tw) / 2, 120), caption, font=f, fill=WHITE)
    sw = 820
    sh = round(shot.height * sw / shot.width)
    s = rounded(shot.resize((sw, sh), Image.LANCZOS).convert("RGBA"), 44)
    x, y = (W - sw) // 2, 280
    shadow = Image.new("RGBA", (sw + 80, sh + 80), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((40, 50, sw + 40, sh + 40), 44, fill=(0, 0, 0, 110))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)), (x - 40, y - 40))
    canvas.alpha_composite(s, (x, y))
    return canvas.convert("RGB")


def feature_graphic(shot, icon):
    W, H = 1024, 500
    canvas = gradient(W, H).convert("RGBA")
    d = ImageDraw.Draw(canvas)
    ic = rounded(icon.resize((84, 84), Image.LANCZOS).convert("RGBA"), 20)
    canvas.alpha_composite(ic, (64, 120))
    d.text((166, 134), "LEADDRIVE", font=font(30, 700), fill=MINT)
    d.text((166, 168), "CRM", font=font(22, 500), fill=(170, 210, 196))
    d.text((64, 222), "Route Field", font=font(76, 800), fill=WHITE)
    tag = font(29, 450)
    d.text((64, 322), "Marşrut, ziyarət və tapşırıqlar —", font=tag, fill=MINT)
    d.text((64, 360), "sahədə, internet olmadan da.", font=tag, fill=MINT)
    # the top of the Today screen, as a phone tilted into the frame
    top = shot.crop((0, 0, 1080, 1320))
    pw = 380
    ph = round(top.height * pw / top.width)
    phone = Image.new("RGBA", (pw + 24, ph + 24), (12, 22, 19, 255))
    phone = rounded(phone, 46)
    phone.alpha_composite(rounded(top.resize((pw, ph), Image.LANCZOS).convert("RGBA"), 34), (12, 12))
    phone = phone.rotate(-7, resample=Image.BICUBIC, expand=True)
    shadow = Image.new("RGBA", phone.size, (0, 0, 0, 0))
    shadow.putalpha(phone.getchannel("A").point(lambda v: 90 if v else 0))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)), (606, 64))
    canvas.alpha_composite(phone, (590, 46))
    return canvas.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    for lang in ("az", "ru", "en"):
        os.makedirs(os.path.join(OUT, f"phone-{lang}"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "phone-plain"), exist_ok=True)
    shots = {}
    for name, src, captions in SET:
        shot = Image.open(os.path.join(SHOTS, src)).convert("RGB").crop(CROP)
        shots[name] = shot
        shot.save(os.path.join(OUT, "phone-plain", f"{name}.png"), optimize=True)
        for lang, cap in captions.items():
            framed(shot, cap).save(os.path.join(OUT, f"phone-{lang}", f"{name}.png"), optimize=True)
    feature_graphic(shots["01-today"], Image.open(ICON)).save(os.path.join(OUT, "feature-graphic-1024x500.png"), optimize=True)
    Image.open(ICON).save(os.path.join(OUT, "icon-512.png"))


if __name__ == "__main__":
    main()
