
import os
import tempfile
from fastapi import FastAPI, File, HTTPException, UploadFile
from rapidocr_onnxruntime import RapidOCR

app = FastAPI(title="Poster OCR")
ocr = RapidOCR()

@app.post("/ocr")
async def extract_text(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "image is required")
    suffix = os.path.splitext(image.filename or "poster.png")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
        temp.write(await image.read())
        path = temp.name
    try:
        result, _ = ocr(path)
        blocks = []
        for box, text, confidence in result or []:
            blocks.append({"text": text, "confidence": round(float(confidence), 4), "box": box})
        return {"blocks": blocks}
    finally:
        os.unlink(path)