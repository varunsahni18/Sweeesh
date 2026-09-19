import fitz, json

doc = fitz.open("/Users/varunsahni/Documents/Resume/Varun_Sahni_Resume_2026_v3.pdf")
page = doc[0]
W, H = page.rect.width, page.rect.height

blocks = []
for b in page.get_text("blocks"):
    x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
    text = text.strip()
    if not text:
        continue
    blocks.append({
        "y0": round(y0 / H, 4), "y1": round(y1 / H, 4),
        "x0": round(x0 / W, 4), "x1": round(x1 / W, 4),
        "text": text.replace("\n", " | ")[:200]
    })

print(json.dumps(blocks, indent=1))
