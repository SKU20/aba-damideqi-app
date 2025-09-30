import argparse
import json
import sys
from pathlib import Path

from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

# Categories used by the frontend
CATEGORIES = {
    "car": [
        "car exterior",
        "car interior",
        "car engine",
        "motorcycle",
        "truck",
        "person",
        "random object",
    ],
    "motorcycle": [
        "motorcycle",
        "car exterior",
        "car interior",
        "car engine",
        "truck",
        "person",
        "random object",
    ],
}


def classify_image(model, processor, image_path: Path, labels):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(text=labels, images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
        logits_per_image = outputs.logits_per_image
        probs = logits_per_image.softmax(dim=1)
    pred_idx = int(probs.argmax().item())
    pred_label = labels[pred_idx]
    pred_conf = float(probs[0, pred_idx].item())
    return pred_label, pred_conf


def validate_images(vehicle_type: str, image_paths):
    vt = (vehicle_type or "car").lower()
    labels = CATEGORIES.get(vt, CATEGORIES["car"])

    engine_count = 0
    invalid = []
    preds = []

    for p in image_paths:
        try:
            label, conf = classify_image(MODEL, PROCESSOR, Path(p), labels)
            preds.append({"path": str(p), "label": label, "confidence": conf})
            if vt == "car":
                if "car engine" in label:
                    engine_count += 1
                allowed = ("car exterior" in label) or ("car interior" in label) or ("car engine" in label)
                if not allowed:
                    invalid.append({"path": str(p), "predicted": label, "confidence": conf})
            elif vt == "motorcycle":
                # For motorcycle, ONLY motorcycle images are allowed
                # Disallow car exterior/interior/engine/person/truck/random object, etc.
                allowed = ("motorcycle" in label)
                if not allowed:
                    invalid.append({"path": str(p), "predicted": label, "confidence": conf})
        except Exception as e:
            invalid.append({"path": str(p), "predicted": f"error: {e}", "confidence": 0.0})

    result = {
        "ok": True,
        "reason": "All photos valid",
        "engineCount": engine_count,
        "invalid": invalid,
        "predictions": preds,
    }

    # Car-specific requirement: exactly one engine photo
    if vt == "car" and engine_count != 1:
        result["ok"] = False
        result["reason"] = f"Exactly 1 engine photo is required (found {engine_count})."

    # Type-specific invalid reasons
    if len(invalid) > 0:
        result["ok"] = False
        if vt == "motorcycle":
            result["reason"] = "Only motorcycle photos are allowed."
        elif vt == "car":
            # Only car exterior/interior/engine are allowed
            # Keep previous reason if engine rule already set; otherwise set car-specific reason
            if not result.get("reason"):
                result["reason"] = "Images must be of a car (exterior, interior, or engine)."
        else:
            result["reason"] = f"Invalid photos: {len(invalid)}"

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--vehicle_type", required=True, choices=["car", "motorcycle"]) 
    parser.add_argument("images", nargs="+")
    args = parser.parse_args()

    images = [Path(p) for p in args.images]
    # Filter non-existent files early
    images = [p for p in images if p.exists()]

    result = validate_images(args.vehicle_type, images)
    print(json.dumps(result))


if __name__ == "__main__":
    # Lazy-load the model at process start so repeated calls are fast within the same container
    MODEL = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    PROCESSOR = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    main()
