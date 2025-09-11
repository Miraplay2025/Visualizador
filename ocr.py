import sys
import easyocr
import json

image_path = sys.argv[1]

try:
    reader = easyocr.Reader(['pt'], gpu=False)
    # detail=1 para pegar coordenadas (útil para destacar se quiser depois)
    result = reader.readtext(image_path, detail=0)  
    text = " ".join(result)
except Exception as e:
    text = ""
    print(json.dumps({"text": text, "error": str(e)}))
    sys.exit(1)

print(json.dumps({"text": text}))
