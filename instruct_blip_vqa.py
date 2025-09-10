import sys
from PIL import Image
from lavis.models import load_model_and_preprocess

image_path = sys.argv[1]
question = sys.argv[2]

# Carregar modelo (pequeno e rápido)
model, vis_processors, txt_processors = load_model_and_preprocess(
    name="instruct_blip", model_type="base", is_eval=True
)

raw_image = Image.open(image_path).convert("RGB")
image = vis_processors["eval"](raw_image).unsqueeze(0)

# Responder pergunta
answer = model.predict(
    "vqa",
    image,
    question
)

print(answer)
