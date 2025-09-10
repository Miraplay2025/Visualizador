import os
from flask import Flask, render_template, request, redirect, url_for
from werkzeug.utils import secure_filename
from PIL import Image

# Import do LLaVA (após instalação via clone)
from llava.model import load_model_and_preprocess

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp'}

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Carrega modelo LLaVA
model_name = "llava_tiny"
llava_model, preprocess = load_model_and_preprocess(model_name, device="cpu")  # ou "cuda"

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

images_dict = {}

@app.route("/", methods=['GET', 'POST'])
def index():
    answer = None
    image_url = None
    image_name = None

    # Upload de imagem
    if request.method == 'POST' and 'image' in request.files:
        file = request.files['image']
        if file.filename != '' and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            images_dict[filename] = filepath
            image_url = url_for('uploaded_file', filename=filename)
            image_name = filename

    # Pergunta sobre a imagem
    if request.method == 'POST' and 'question' in request.form and 'image_name' in request.form:
        question = request.form['question']
        image_name = request.form['image_name']
        if image_name in images_dict:
            image_path = images_dict[image_name]
            img = preprocess(Image.open(image_path)).unsqueeze(0)

            # Resposta real do LLaVA
            answer = llava_model.generate({"image": img, "text_input": question}, max_new_tokens=200)[0]

            image_url = url_for('uploaded_file', filename=image_name)

    return render_template('index.html', answer=answer, image_url=image_url, image_name=image_name)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return redirect(url_for('static', filename='uploads/' + filename))

@app.route('/delete/<filename>', methods=['POST'])
def delete_file(filename):
    if filename in images_dict:
        try:
            os.remove(images_dict[filename])
            del images_dict[filename]
        except Exception as e:
            print(f"Erro ao excluir arquivo: {e}")
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
