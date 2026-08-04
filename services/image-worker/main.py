import base64
import io
import os
from typing import Literal
import httpx
import imagehash
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

app = FastAPI(title="Poster Renderer")
W, H = 1242, 1660
FONT_PATHS = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

def font(size):
    for path in FONT_PATHS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

async def load_image(value: str):
    if value.startswith("data:image"):
        return Image.open(io.BytesIO(base64.b64decode(value.split(",", 1)[1]))).convert("RGB")
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(value)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content)).convert("RGB")

class Copy(BaseModel):
    title: str
    subtitle: str = ""
    benefits: list[str] = []
    eyebrow: str = ""

class RenderRequest(BaseModel):
    background: str
    copy: Copy
    layout: Literal["clean", "bold", "notebook"] = "bold"

def center(draw, text, y, fill, size, stroke=0, stroke_fill="#111"):
    text_font = font(size)
    box = draw.textbbox((0, 0), text, font=text_font, stroke_width=stroke)
    draw.text(((W - (box[2]-box[0])) / 2, y), text, font=text_font, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)

def wrap_lines(draw, text, text_font, max_width):
    lines, current = [], ""
    for char in text:
        candidate = current + char
        if draw.textbbox((0, 0), candidate, font=text_font)[2] <= max_width:
            current = candidate
        else:
            if current: lines.append(current)
            current = char
    if current: lines.append(current)
    return lines[:2]

@app.post("/render")
async def render(request: RenderRequest):
    image = await load_image(request.background)
    image = image.resize((W, H), Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    panel = ImageDraw.Draw(overlay)
    panel.rounded_rectangle((44, 48, W - 44, 800), 38, fill=(255, 252, 246, 228))
    panel.rounded_rectangle((44, 1120, W - 44, H - 44), 38, fill=(255, 252, 246, 234))
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(image)
    if request.copy.eyebrow:
        center(draw, request.copy.eyebrow, 105, "#6e6254", 32)
    title_font = font(92)
    title_lines = wrap_lines(draw, request.copy.title, title_font, W - 170)
    title_y = 205 if len(title_lines) == 1 else 160
    for line in title_lines:
        center(draw, line, title_y, "#20201d", 92)
        title_y += 118
    if request.copy.subtitle:
        center(draw, request.copy.subtitle, title_y + 24, "#e06438", 58)
    benefits = request.copy.benefits[:4]
    for index, text in enumerate(benefits):
        column, row = index % 2, index // 2
        x, y = 76 + column * 556, 1195 + row * 170
        draw.rounded_rectangle((x, y, x + 510, y + 132), 20, fill="#ffffff", outline="#eee6d8", width=3)
        draw.rounded_rectangle((x + 20, y + 34, x + 74, y + 88), 14, fill="#2dcc45")
        draw.line((x+32, y+60, x+43, y+72, x+63, y+47), fill="white", width=7)
        draw.text((x + 94, y + 40), text, font=font(37), fill="#25231f")
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return Response(output.getvalue(), media_type="image/png", headers={"Content-Disposition": "attachment; filename=remade-poster.png"})

class SimilarityRequest(BaseModel):
    reference: str
    candidate: str

@app.post("/similarity")
async def similarity(request: SimilarityRequest):
    reference, candidate = await load_image(request.reference), await load_image(request.candidate)
    distance = imagehash.phash(reference) - imagehash.phash(candidate)
    score = round(max(0, 1 - distance / 64), 4)
    return {"perceptualSimilarity": score, "pass": score <= 0.70}
