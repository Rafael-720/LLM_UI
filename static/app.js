const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const micBtn = document.getElementById('mic-btn');
const imageBtn = document.getElementById('image-btn');
const audioBtn = document.getElementById('audio-btn');
const voiceModeBtn = document.getElementById('voice-mode-btn');
const modelSelect = document.getElementById('model-select');
const messagesContainer = document.getElementById('messages');
const emptyState = document.getElementById('empty-state');
const recordingIndicator = document.getElementById('recording-indicator');
const recordingTimer = document.getElementById('recording-timer');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');
const whisperModelSelect = document.getElementById('whisper-model-select');
const whisperDeviceSelect = document.getElementById('whisper-device-select');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let startTime;
let timerInterval;
let abortController = null; // For stopping generation
let isVoiceMode = false;
// VAD (Silence Detection) variables
let audioContext;
let analyser;
let microphone;
let silenceStart;
let speechStarted = false; // Flag to check if user started speaking
const SILENCE_THRESHOLD = 30; // Increased to tolerate background noise
const VOICE_THRESHOLD = 45;   // Increased to distinguish voice from noise
const SILENCE_DURATION = 2000; // 2 seconds of silence to trigger stop

// Global Error Handler
window.onerror = function (msg, url, line, col, error) {
    alert(`JS Error: ${msg}\nLine: ${line}`);
    return false;
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    if (!imageBtn) console.error('Image button not found!');
    if (!audioBtn) console.error('Audio button not found!');
    if (!voiceModeBtn) console.error('Voice Mode button not found!');
    init();
});

async function init() {
    console.log('Initializing app...');
    await loadModels();
    await loadSettings();
    setupEventListeners();
    userInput.focus();
}

async function loadModels() {
    try {
        const response = await fetch('/api/models');
        const data = await response.json();

        while (modelSelect.options.length > 1) {
            modelSelect.remove(1);
        }

        if (data.models) {
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                modelSelect.appendChild(option);
            });

            if (data.models.length > 0) {
                modelSelect.value = data.models[0].name;
            }
        }
    } catch (error) {
        console.error('Failed to load models:', error);
        appendMessage('system', 'Error: Could not load models. Is the backend running?');
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/settings/whisper');
        const data = await response.json();
        if (data.model) {
            whisperModelSelect.value = data.model;
        }
        if (data.device) {
            whisperDeviceSelect.value = data.device;
        }

        // Disable GPU option if not available
        if (data.cuda_available === false) {
            const gpuOption = whisperDeviceSelect.querySelector('option[value="cuda"]');
            if (gpuOption) {
                gpuOption.disabled = true;
                gpuOption.textContent += " (Not Available)";
            }
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

function setupEventListeners() {
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        toggleSendButton();
    });

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);
    stopBtn.addEventListener('click', stopGeneration);
    micBtn.addEventListener('click', toggleRecording);
    imageBtn.addEventListener('click', generateImage);
    audioBtn.addEventListener('click', () => generateAudio());
    voiceModeBtn.addEventListener('click', toggleVoiceMode);

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const selectedModel = whisperModelSelect.value;
        const selectedDevice = whisperDeviceSelect.value;

        saveSettingsBtn.textContent = 'Saving...';
        saveSettingsBtn.disabled = true;

        try {
            const response = await fetch('/api/settings/whisper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_size: selectedModel,
                    device: selectedDevice
                })
            });

            if (response.ok) {
                settingsModal.classList.add('hidden');
                loadSettings();
            } else {
                const err = await response.json();
                alert('Failed to change settings: ' + (err.detail || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Error saving settings');
        } finally {
            saveSettingsBtn.textContent = 'Save';
            saveSettingsBtn.disabled = false;
        }
    });

    // Close modal on outside click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });
}

function toggleSendButton() {
    sendBtn.disabled = !userInput.value.trim();
}

function showStopButton() {
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
}

function showSendButton() {
    stopBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
}

// Audio Recording
async function toggleRecording() {
    console.log(`toggleRecording called. isVoiceMode: ${isVoiceMode}, isRecording: ${isRecording}`);

    // Disable Voice Mode if active, as Mic button implies manual control
    if (isVoiceMode) {
        console.log('Disabling Voice Mode via Mic button');
        isVoiceMode = false;
        voiceModeBtn.classList.remove('active');
        voiceModeBtn.style.color = '';
        appendMessage('system', 'Voice Mode OFF (Manual Mic used).');

        // If VAD was running, we need to ensure it doesn't interfere
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
    }

    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            console.log('mediaRecorder.onstop fired');
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            console.log(`Audio Blob created. Size: ${audioBlob.size} bytes`);
            await processAudio(audioBlob);
        };

        mediaRecorder.start();
        console.log('mediaRecorder started');
        isRecording = true;
        micBtn.classList.add('recording');
        recordingIndicator.classList.remove('hidden');
        startTimer();

        // Initialize VAD if in Voice Mode
        if (isVoiceMode) {
            setupSilenceDetection(stream);
        }

    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access microphone. Please ensure permissions are granted.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        micBtn.classList.remove('recording');
        recordingIndicator.classList.add('hidden');
        stopTimer();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        // Cleanup VAD
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
    }
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const seconds = Math.floor((elapsed / 1000) % 60);
        const minutes = Math.floor((elapsed / 1000 / 60));
        recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    recordingTimer.textContent = '00:00';
}

async function processAudio(audioBlob) {
    console.log('processAudio called');
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.wav');

    const tempId = appendMessage('user', '🎤 Transcribing audio...', true);

    try {
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Transcription failed');

        const data = await response.json();

        removeMessage(tempId);
        if (data.text) {
            userInput.value = data.text;
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
            userInput.focus();

            // Auto-send if Voice Mode is ON
            if (isVoiceMode) {
                console.log('Voice Mode ON: Auto-sending message...');
                sendMessage();
            } else {
                console.log('Voice Mode OFF: Manual send required.');
            }
        }

    } catch (error) {
        console.error('Transcription error:', error);
        removeMessage(tempId);
        appendMessage('system', 'Error transcribing audio.');
    }
}

// Image Generation
async function generateImage() {
    console.log('Image button clicked');
    const prompt = userInput.value.trim();
    console.log('Prompt:', prompt);

    if (!prompt) {
        alert('Please enter a description for the image in the chat box first!');
        return;
    }

    userInput.value = '';
    userInput.style.height = 'auto';
    toggleSendButton();
    emptyState.classList.add('hidden');

    appendMessage('user', `🎨 Generate image: ${prompt}`);
    const botMessageId = appendMessage('bot', 'Generating image... (this may take a moment)');
    const botMessageContent = document.getElementById(`msg-content-${botMessageId}`);

    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) throw new Error('Generation failed');

        const data = await response.json();

        if (data.image) {
            botMessageContent.innerHTML = `<img src="${data.image}" alt="Generated Image" style="max-width: 100%; border-radius: 8px;">`;
        } else {
            botMessageContent.innerHTML = 'Failed to generate image.';
        }

    } catch (error) {
        console.error('Image generation error:', error);
        botMessageContent.innerHTML = '<span style="color:red">Error generating image. Check backend logs.</span>';
    }
}

function toggleVoiceMode() {
    if (isRecording) {
        // If recording, just stop recording but KEEP Voice Mode ON
        stopRecording();
        // Visual feedback is handled by stopRecording/processAudio
    } else {
        // If not recording, toggle the mode state
        isVoiceMode = !isVoiceMode;

        if (isVoiceMode) {
            voiceModeBtn.classList.add('active');
            voiceModeBtn.style.color = '#4CAF50'; // Green
            appendMessage('system', 'Voice Mode ON: Recording started...');
            startRecording();
        } else {
            voiceModeBtn.classList.remove('active');
            voiceModeBtn.style.color = ''; // Reset
            appendMessage('system', 'Voice Mode OFF.');
        }
    }
}

// Audio Generation
async function generateAudio(textToSpeak = null) {
    console.log('Audio generation triggered');
    const text = textToSpeak || userInput.value.trim();
    console.log('Text:', text);

    if (!text) {
        alert('Please enter the text you want to hear in the chat box first!');
        return;
    }

    if (!textToSpeak) {
        userInput.value = '';
        userInput.style.height = 'auto';
        toggleSendButton();
        emptyState.classList.add('hidden');
        appendMessage('user', `🔊 Speak: ${text}`);
    }

    const botMessageId = appendMessage('bot', 'Generating audio...');
    const botMessageContent = document.getElementById(`msg-content-${botMessageId}`);

    try {
        const response = await fetch('/api/generate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) throw new Error('Audio generation failed');

        const data = await response.json();

        if (data.audio) {
            botMessageContent.innerHTML = `
                <audio id="bot-audio-${botMessageId}" controls autoplay style="width: 100%;">
                    <source src="${data.audio}" type="audio/mp3">
                    Your browser does not support the audio element.
                </audio>
            `;

            // Continuous Conversation: Restart recording after audio ends
            if (isVoiceMode) {
                const audioEl = document.getElementById(`bot-audio-${botMessageId}`);
                audioEl.onended = () => {
                    console.log('Audio ended. Restarting recording for continuous conversation...');
                    if (isVoiceMode && !isRecording) {
                        startRecording();
                    }
                };
            }
        } else {
            botMessageContent.innerHTML = 'Failed to generate audio.';
        }

    } catch (error) {
        console.error('Audio generation error:', error);
        botMessageContent.innerHTML = '<span style="color:red">Error generating audio. Check backend logs.</span>';
    }
}

// Chat Logic
async function sendMessage() {
    const text = userInput.value.trim();
    const model = modelSelect.value;

    console.log(`sendMessage called. Text: "${text}", Model: "${model}"`);

    if (!text || !model) {
        console.warn('sendMessage aborted: Missing text or model');
        return;
    }

    userInput.value = '';
    userInput.style.height = 'auto';
    toggleSendButton();
    emptyState.classList.add('hidden');
    showStopButton();

    appendMessage('user', text);

    const botMessageId = appendMessage('bot', '');
    const botMessageContent = document.getElementById(`msg-content-${botMessageId}`);

    let fullResponse = '';
    abortController = new AbortController();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: text }]
            }),
            signal: abortController.signal
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.message && json.message.content) {
                        fullResponse += json.message.content;
                        botMessageContent.innerHTML = marked.parse(fullResponse);
                        scrollToBottom();
                    }
                } catch (e) {
                    console.error('Error parsing chunk:', e);
                }
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Generation stopped by user');
        } else {
            console.error('Chat error:', error);
            botMessageContent.innerHTML = '<span style="color:red">Error communicating with backend.</span>';
        }
    } finally {
        showSendButton();
        abortController = null;

        // Auto-TTS if Voice Mode is ON
        console.log(`Generation finished. VoiceMode: ${isVoiceMode}, ResponseLength: ${fullResponse.length}`);
        if (isVoiceMode && fullResponse) {
            console.log('Triggering Auto-TTS...');
            // Wait a bit before starting audio generation to let UI settle
            setTimeout(() => {
                generateAudio(fullResponse);
            }, 500);
        }
    }
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}

function appendMessage(role, text, isTemp = false) {
    const id = Date.now();
    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    div.id = `msg-${id}`;

    const avatar = role === 'user' ? '👤' : '🦙';
    const avatarClass = role === 'user' ? 'user-avatar' : 'bot-avatar';

    if (role === 'system') {
        div.innerHTML = `<div style="color: red; margin: 0 auto;">${text}</div>`;
    } else {
        div.innerHTML = `
            <div class="message-avatar ${avatarClass}">${avatar}</div>
            <div class="message-content" id="msg-content-${id}">
                ${isTemp ? text : marked.parse(text)}
            </div>
        `;
    }

    messagesContainer.appendChild(div);
    scrollToBottom();
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.remove();
}

function scrollToBottom() {
    const main = document.getElementById('chat-container');
    main.scrollTop = main.scrollHeight;
}

// init() called via DOMContentLoaded
