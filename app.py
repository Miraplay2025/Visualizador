from flask import Flask, request, render_template, jsonify
from transformers import GPT2LMHeadModel, GPT2Tokenizer

app = Flask(__name__)

# Carregando o modelo GPT-2 e o tokenizer
model_name = "gpt2"
model = GPT2LMHeadModel.from_pretrained(model_name)
tokenizer = GPT2Tokenizer.from_pretrained(model_name)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    user_input = request.form["message"]
    
    # Tokenizando a entrada do usuário
    inputs = tokenizer.encode(user_input, return_tensors="pt")
    
    # Gerando a resposta
    outputs = model.generate(inputs, max_length=100, num_return_sequences=1)
    
    # Decodificando a resposta
    bot_output = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    return jsonify({"response": bot_output})

if __name__ == "__main__":
    app.run(debug=True)
