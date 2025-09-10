from flask import Flask, render_template, request, jsonify
import os
from PIL import Image
import torch
import cv2
import numpy as np
import tesserocr
from detectron2.engine import DefaultPredictor
from detectron2.config import get_cfg
from detectron2 import model_zoo
from detectron2.utils.visualizer import Visualizer

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ----------------------
# Configuração Detectron2
cfg = get_cfg()
cfg.merge_from_file(model_zoo.get_config_file("COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml"))
cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = 0.5
cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url("COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml")
predictor = DefaultPredictor(cfg)

# Função para detectar objetos
def detectar_objetos(imagem_path):
    img = cv2.imread(imagem_path)
    outputs = predictor(img)
    classes = outputs["instances"].pred_classes.cpu().numpy()
    labels = [predictor.metadata.get("thing_classes")[c] for c in classes]
    return labels

# Função para extrair texto
def detectar_texto(imagem_path):
    img = Image.open(imagem_path)
    text = tesserocr.image_to_text(img)
    text = [t.strip().lower() for t in text.splitlines() if t.strip()]
    return text

# Comparar duas listas e retornar elementos comuns
def comparar_listas(list1, list2):
    return list(set(list1) & set(list2))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/comparar', methods=['POST'])
def comparar():
    if 'imagem1' not in request.files or 'imagem2' not in request.files:
        return jsonify({'error': 'Envie duas imagens'}), 400

    img1 = request.files['imagem1']
    img2 = request.files['imagem2']

    path1 = os.path.join(app.config['UPLOAD_FOLDER'], img1.filename)
    path2 = os.path.join(app.config['UPLOAD_FOLDER'], img2.filename)
    img1.save(path1)
    img2.save(path2)

    # Detectar objetos
    objetos1 = detectar_objetos(path1)
    objetos2 = detectar_objetos(path2)
    objetos_comuns = comparar_listas(objetos1, objetos2)

    # Detectar textos
    textos1 = detectar_texto(path1)
    textos2 = detectar_texto(path2)
    textos_comuns = comparar_listas(textos1, textos2)

    # Resultado
    if objetos_comuns or textos_comuns:
        resultado = {
            'status': 'iguais',
            'objetos_comuns': objetos_comuns,
            'textos_comuns': textos_comuns
        }
    else:
        resultado = {'status': 'diferentes'}

    return jsonify(resultado)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
