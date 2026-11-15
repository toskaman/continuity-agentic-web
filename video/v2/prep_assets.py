"""Bakes the blurred/dimmed focus backgrounds and the per-column after-state crops (no CSS filters/clip-paths at render time)."""
import json, os
from PIL import Image, ImageFilter, ImageEnhance
os.makedirs("assets/stills/blur", exist_ok=True); os.makedirs("assets/stills/cols", exist_ok=True)
for f in sorted(os.listdir("assets/stills")):
    if not f.endswith(".jpg"): continue
    im = Image.open(os.path.join("assets/stills", f)).convert("RGB")
    s = im.width / 1920
    b = im.resize((1920, 1080), Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))
    b = ImageEnhance.Color(b).enhance(0.75); b = ImageEnhance.Brightness(b).enhance(0.46)
    b.save(os.path.join("assets/stills/blur", f), quality=88)
B = json.load(open("data/bounds.json"))
im = Image.open("assets/stills/10b_wall_after_hi.jpg").convert("RGB"); s = im.width / 1920
for i, st in enumerate(B["wallClean"]["sites"]):
    x, y, w, h = st["x"] - 2, st["y"] - 2, st["w"] + 4, st["h"] + 4
    im.crop((int(x*s), int(y*s), int((x+w)*s), int((y+h)*s))).save(f"assets/stills/cols/after_{i}.jpg", quality=93)
print("ok")
