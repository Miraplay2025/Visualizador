from flask import Flask, render_template, request, jsonify
import os
from PIL import Image
import tesserocr
from ultralytics import YOLO

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Carregar modelo YOLOv8 pré-treinado (nano, leve)
model = YOLO("yolov8n.pt")

# Função para detectar objetos usando YOLOv8
def detectar_objetos(imagem_path):
    results = model(imagem_path)
    objetos = []
    for r in results:
        if hasattr(r, "boxes") and r.boxes is not None:
            for cls_id in r.boxes.cls:
                objetos.append(model.names[int(cls_id)])
    return objetos

# Função para extrair texto usando Tesseract
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
