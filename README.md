# LLM UI - Interface Multimodal com Voz e Chat

Uma interface web moderna e responsiva para interagir com modelos de linguagem locais (via Ollama), oferecendo suporte nativo para conversação por voz em tempo real, transcrição de áudio e geração de imagens.

![LLM UI Screenshot](https://via.placeholder.com/800x400?text=LLM+UI+Screenshot)

## 🚀 Funcionalidades Principais

*   **💬 Chat com LLMs Locais**: Integração direta com o **Ollama** para rodar modelos como Llama 3, Mistral, Phi, etc., localmente no seu PC.
*   **🗣️ Modo de Voz em Tempo Real**:
    *   **Reconhecimento de Fala (STT)**: Utiliza o **OpenAI Whisper** (com suporte a GPU/CUDA) para transcrever sua fala com alta precisão.
    *   **Síntese de Voz (TTS)**: Respostas do bot são lidas em voz alta usando **Edge-TTS**, proporcionando uma voz natural e fluida.
    *   **Detecção de Atividade de Voz (VAD)**: O sistema detecta automaticamente quando você para de falar para enviar a mensagem, permitindo uma conversa "mãos livres".
*   **🎨 Geração de Imagens**: Crie imagens a partir de texto usando modelos **Latent Consistency Models (LCM)** via biblioteca `diffusers`, otimizados para geração rápida.
*   **⚡ Performance**: Backend assíncrono construído com **FastAPI**.

## 🛠️ Tecnologias Utilizadas

*   **Backend**: Python, FastAPI, Uvicorn.
*   **Frontend**: HTML5, Vanilla JavaScript, CSS3.
*   **IA & Modelos**:
    *   **LLM**: [Ollama](https://ollama.com/) (Llama 3, Mistral, etc.)
    *   **Transcriçao (STT)**: [OpenAI Whisper](https://github.com/openai/whisper)
    *   **Áudio (TTS)**: [Edge-TTS](https://github.com/rany2/edge-tts)
    *   **Imagens**: [Hugging Face Diffusers](https://huggingface.co/docs/diffusers/index)

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

1.  **Python 3.10** ou superior.
2.  **[Ollama](https://ollama.com/)**: Deve estar instalado e rodando em segundo plano.
3.  **FFmpeg**: Necessário para processamento de áudio (o script de instalação tenta configurar automaticamente, mas é bom ter no sistema).
4.  **Placa de Vídeo NVIDIA (Opcional)**: Altamente recomendado para o Whisper e Geração de Imagens funcionarem rapidamente.

## 🔧 Instalação e Execução

O projeto inclui um script automatizado para facilitar a configuração no Windows.

1.  **Clone o repositório** (ou baixe os arquivos):
    ```bash
    git clone https://github.com/Rafael-720/LLM_UI.git
    cd llm-ui
    ```

2.  **Execute o script de inicialização**:
    Dê um duplo clique no arquivo `run_windows.bat`.

    Este script irá:
    *   Verificar se o Python está instalado.
    *   Configurar o FFmpeg (se necessário).
    *   Criar um ambiente virtual (`venv`).
    *   Instalar todas as dependências (`requirements.txt`), incluindo suporte a CUDA se disponível.
    *   Iniciar o servidor.

3.  **Acesse a Aplicação**:
    Abra seu navegador e vá para:
    ```
    http://localhost:8000
    ```

## 📖 Como Usar

### Configuração Inicial
1.  Certifique-se que o **Ollama** está rodando (`ollama serve` no terminal ou via ícone na bandeja).
2.  Na interface web, selecione o modelo de chat desejado no menu suspenso (canto superior direito).
3.  (Opcional) Clique em **Settings** ⚙️ para configurar o tamanho do modelo Whisper (ex: `base`, `small`, `medium`) e o dispositivo (`cuda` para GPU ou `cpu`).

### Modos de Interação

*   **Chat de Texto**: Digite sua mensagem e pressione Enter.
*   **Microfone (Transcrição)** 🎤: Clique para gravar. Clique novamente para parar. O áudio será transcrito para texto, mas **não** enviado automaticamente. Útil para ditar mensagens longas.
*   **Modo de Voz (Conversa)** 🎧:
    *   Clique no ícone de fone de ouvido.
    *   Fale normalmente. O sistema detectará o silêncio, enviará a mensagem e responderá em áudio automaticamente.
    *   A conversa continua em loop até você desativar o modo.
*   **Geração de Imagem** 🖼️:
    *   Digite a descrição da imagem no campo de texto.
    *   Clique no ícone de imagem (ao lado do microfone).

## 🤝 Contribuição

Sinta-se à vontade para abrir issues ou enviar pull requests para melhorias!

## 📄 Licença

Este projeto está sob a licença MIT.
