import sys
import os
import re
import json

try:
    import cv2
    import easyocr
except Exception as e:
    print(json.dumps({
        "error": f"Missing Python deps: {e}",
        "hint": "pip install easyocr opencv-python-headless numpy"
    }))
    sys.exit(1)


def extract_last_frame(video_path, output_image):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None, "cannot open video"

    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or fps * 10

    target_frame = max(0, total_frames - (2 * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

    ret, frame = cap.read()
    if not ret:
        cap.release()
        return None, "cannot read frame"

    cv2.imwrite(output_image, frame)
    cap.release()
    return output_image, None


def extract_info(image_path):
    reader = easyocr.Reader(['en'], gpu=False)
    results = reader.readtext(image_path)

    all_text = " ".join([t for _, t, _ in results])

    info = {
        "year": None,
        "brand": None,
        "best_0_60_s": None,
        "best_0_100_s": None,  # NEW: separate field for 0-100km/h
        "quarter_mile_s": None,
        "best_100_200_s": None,
        "raw_text": all_text,
        "debug_ocr": [t for _, t, _ in results]  # Debug: show all OCR text
    }

    # Year + brand
    m_car = re.search(r"\b((?:19|20)\d{2})\s+([A-Za-z][A-Za-z\-]+(?:\s+[A-Za-z0-9\-]+){0,2})\b", all_text)
    if m_car:
        info["year"] = int(m_car.group(1))
        brand_tokens = m_car.group(2).strip().split()
        info["brand"] = " ".join(brand_tokens[:2])

    # 0-60mph time (works with your existing code)
    m_060 = re.search(r"0\s*[-–]?\s*6[o0]\s*m?ph?.{0,30}?([\d.,]+)\s*s?\b", all_text, re.IGNORECASE)
    if m_060:
        try:
            info["best_0_60_s"] = float(m_060.group(1).replace(',', '.'))
        except Exception:
            pass

    # NEW: 0-100km/h time detection (separate from 0-60mph)
    # Be tolerant to OCR mistakes where '0' is read as 'O': match '1[0O]{2}' and a leading zero/O
    info["best_0_100_s"] = None
    m_0100_head = re.search(r"[0O]\s*[-–]?\s*1[0O]{2}\s*km/?h", all_text, re.IGNORECASE)
    if m_0100_head:
        # Prefer the nearest time after the matched header within a short window
        start = m_0100_head.end()
        window = all_text[start:start+60]
        m_0100_time = re.search(r"([\d.,]+)\s*s\b", window)
        if m_0100_time:
            try:
                info["best_0_100_s"] = float(m_0100_time.group(1).replace(',', '.'))
            except Exception:
                pass

    # Quarter-mile (optional)
    m_qm = re.search(r"1\/4\s*mile.{0,30}?([\d.,]+)\s*s?\b", all_text, re.IGNORECASE)
    if m_qm:
        try:
            info["quarter_mile_s"] = float(m_qm.group(1).replace(',', '.'))
        except Exception:
            pass

    # 100-200 km/h time - Improved detection with more flexible pattern
    info["debug_100_200"] = {
        "found_100_200_text": False,
        "time_matches": [],
        "selected_time": None
    }
    
    # Look for 100-200km/h pattern with tolerance for 'O' vs '0'
    m_100_200 = re.search(r"1[0O]{2}\s*[-–]?\s*2[0O]{2}\s*km/?h", all_text, re.IGNORECASE)
    
    if m_100_200:
        info["debug_100_200"]["found_100_200_text"] = True
        info["debug_100_200"]["matched_text"] = m_100_200.group(0)
        
        # Prefer the nearest time after the matched header within a short window
        start = m_100_200.end()
        window = all_text[start:start+80]
        # Any decimal or integer with optional comma/dot, followed by 's'
        m_time = re.search(r"([\d]+(?:[\.,][\d]+)?)\s*s\b", window)
        if m_time:
            try:
                time_val = float(m_time.group(1).replace(',', '.'))
                if 3.0 <= time_val <= 15.0:
                    info["best_100_200_s"] = time_val
                    info["debug_100_200"]["selected_time"] = time_val
                info["debug_100_200"]["time_matches"] = [m_time.group(1)]
            except Exception:
                pass

    return info


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: py_dragy_extractor.py <video_path>"}))
        return 1

    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        print(json.dumps({"error": f"video not found: {video_path}"}))
        return 1

    out_img = os.path.join(os.path.dirname(video_path), "last_frame_extracted.png")
    img_path, err = extract_last_frame(video_path, out_img)
    if err:
        print(json.dumps({"error": err}))
        return 1

    info = extract_info(img_path)
    print(json.dumps(info))
    return 0


if __name__ == "__main__":
    sys.exit(main())