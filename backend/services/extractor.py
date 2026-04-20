import base64
import io
from pathlib import Path


def extract_from_pdf(file_path: str) -> dict:
    """Extract text and page images from a PDF file."""
    import pdfplumber
    from pdf2image import convert_from_path

    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t.strip())

    full_text = "\n\n".join(text_parts)

    # If text is sparse (image-heavy PDF), render pages as images
    images_b64 = []
    if len(full_text) < 300:
        pil_pages = convert_from_path(file_path, dpi=150, fmt="png")
        for page_img in pil_pages[:10]:  # cap at 10 pages
            buf = io.BytesIO()
            page_img.save(buf, format="PNG")
            images_b64.append(base64.b64encode(buf.getvalue()).decode())

    return {"text": full_text, "images": images_b64}


def extract_from_image(file_path: str) -> dict:
    """Read an image file and return base64-encoded content."""
    data = Path(file_path).read_bytes()
    return {"text": "", "images": [base64.b64encode(data).decode()]}
