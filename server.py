from transformers import DonutProcessor, VisionEncoderDecoderModel
from PIL import Image
import torch
from flask import Flask, request, render_template, jsonify
import base64
import io
import os
import tempfile
import gc

# Carrega modelo Donut
processor = DonutProcessor.from_pretrained("naver-clova-ix/donut-base")
model = VisionEncoderDecoderModel.from_pretrained("naver-clova-ix/donut-base")
device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
model.eval()  # Coloca modelo em modo de avaliação

app = Flask(__name__)

def extract_button_text(image: Image.Image):
    try:
        task_prompt = "<s_docvqa><s_question>Qual é o texto do botão de inscrição?</s_question><s_answer>"
        decoder_input_ids = processor.tokenizer(task_prompt, add_special_tokens=False, return_tensors="pt").input_ids

        pixel_values = processor(image, return_tensors="pt").pixel_values

        outputs = model.generate(
            pixel_values.to(device),
            decoder_input_ids=decoder_input_ids.to(device),
            max_length=model.decoder.config.max_position_embeddings,
            early_stopping=True,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
            use_cache=True,
            num_beams=1,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )

        output_text = processor.batch_decode(outputs.sequences)[0]
        output_text = output_text.replace(processor.tokenizer.eos_token, "").replace(processor.tokenizer.pad_token, "")
        output_text = output_text.split("<s_answer>")[-1].strip()
        return output_text
    finally:
        # Limpa memória GPU
        if device == "cuda":
            torch.cuda.empty_cache()
            gc.collect()

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/api", methods=["POST"])
def api():
    temp_file_path = None
    try:
        data = request.json
        image_b64 = data["image"]
        image_bytes = base64.b64decode(image_b64)

        # Salva temporariamente para garantir exclusão
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp.write(image_bytes)
            temp_file_path = tmp.name

        image = Image.open(temp_file_path).convert("RGB")
        texto = extract_button_text(image)

        if "inscrito" in texto.lower():
            status = "Usuário inscrito ✅"
        elif "inscrever-se" in texto.lower():
            status = "Usuário NÃO inscrito ❌"
        else:
            status = "Não foi possível identificar o botão"

        return jsonify({"texto": texto, "status": status})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        # Garante exclusão do arquivo temporário sempre
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
