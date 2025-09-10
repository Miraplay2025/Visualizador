import sys
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

image_path = sys.argv[1]
question = sys.argv[2]

device = "cuda" if torch.cuda.is_available() else "cpu"

# Carregar CLIP
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# Abrir imagem
image = Image.open(image_path).convert("RGB")

# Criar embedding da imagem
inputs = processor(text=[question], images=image, return_tensors="pt", padding=True).to(device)
outputs = model(**inputs)
logits_per_image = outputs.logits_per_image
probs = logits_per_image.softmax(dim=1)

# Resposta simples
answer = f"Probabilidade de '{question}' na imagem: {probs[0][0].item():.2f}"
print(answer)
