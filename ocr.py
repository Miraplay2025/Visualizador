import sys
import easyocr
import json

image_path = sys.argv[1]

try:
    reader = easyocr.Reader(['pt'], gpu=False)
    result = reader.readtext(image_path, detail=0)  # texto puro
    text = " ".join(result)
except Exception as e:
    text = ""
    print(json.dumps({"text": text, "error": str(e)}))
    sys.exit(1)

print(json.dumps({"text": text}))
