"""FastAPI backend for four-digit race-bib detection."""

from __future__ import annotations

from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.pipeline import detect_four_digit_bibs

app = FastAPI(title="Number Detector API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/detect")
async def detect(image: Annotated[UploadFile, File(...)]) -> dict[str, object]:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Expected an image upload.")

    payload = await image.read()
    cv2 = _require_cv2()
    np = _require_numpy()
    decoded = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise HTTPException(status_code=400, detail="Unable to decode image.")

    height, width = decoded.shape[:2]
    return {
        "image": {"filename": image.filename, "width": width, "height": height},
        "detections": detect_four_digit_bibs(decoded),
    }


def _require_cv2():
    try:
        import cv2  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise RuntimeError("FastAPI backend requires opencv-python") from exc
    return cv2


def _require_numpy():
    try:
        import numpy as np  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise RuntimeError("FastAPI backend requires numpy") from exc
    return np
