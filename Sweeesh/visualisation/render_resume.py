import fitz
import os

src = "/Users/varunsahni/Documents/Resume/Varun_Sahni_Resume_2026_v3.pdf"
outdir = "/Users/varunsahni/Desktop/sweesh/Sweeesh/visualisation"
os.makedirs(outdir, exist_ok=True)

doc = fitz.open(src)
page = doc[0]
zoom = 2.5
mat = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=mat, alpha=False)
out_png = os.path.join(outdir, "resume.png")
pix.save(out_png)
print("saved", out_png, pix.width, "x", pix.height, "bytes", os.path.getsize(out_png))
