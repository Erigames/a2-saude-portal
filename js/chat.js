// js/chat.js - Versão Segura para Vercel
// IA genérica - não usa mais resumos pré-montados
let currentAiContext = "";

// Função mantida para compatibilidade, mas não será mais usada com resumos
export function setAiContext(text) {
    currentAiContext = text;
}

// Inicia a sequência do chat - IA genérica sem resumos pré-montados
export function initChatSequence() {
    addMessage("bot", "Olá! Sou a A2 Intelligence.");
    setTimeout(() => { 
        addMessage("bot", "Qual manual deseja acessar?"); 
        showManualOptions(); 
    }, 1000);
}

function addMessage(sender, text) {
    const chatBody = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.classList.add('message', sender);
    div.innerText = text;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}

// Mostra as opções de manuais disponíveis (apenas 2)
function showManualOptions() {
    const chatBody = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.classList.add('cards-container');
    // Apenas dois manuais: Manual de Entrevistas e Portal de Entrevistas Qualificadas
    const options = [
        {id: 'manual-entrevistas', label: 'Manual de Entrevistas'},
        {id: 'portal-entrevistas-qualificadas', label: 'Portal de Entrevistas Qualificadas'}
    ];
    options.forEach(opt => {
        const btn = document.createElement('div');
        btn.classList.add('option-card');
        btn.innerText = opt.label;
        btn.onclick = () => window.selectManual(opt);
        div.appendChild(btn);
    });
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}

export async function sendMessage() {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text) return;
    
    addMessage("user", text);
    input.value = "";
    
    // Loading visual
    const loading = document.createElement('div');
    loading.className = "message bot"; 
    loading.innerText = "..."; 
    loading.id = "loading";
    document.getElementById('chat-messages').appendChild(loading);

    try {
        // IA genérica - pesquisa conforme necessidade do usuário sem script pré-montado
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: text,
                context: "" // Sem contexto pré-montado - IA genérica
            })
        });

        if (!response.ok) throw new Error("Falha na comunicação com o servidor");

        const data = await response.json();
        
        document.getElementById('loading').remove();
        
        // A resposta vem da Vercel no mesmo formato da Groq
        if (data.choices && data.choices[0]) {
            addMessage("bot", data.choices[0].message.content);
        } else {
            addMessage("bot", "Recebi uma resposta vazia da IA.");
        }

    } catch (e) { 
        console.error("Erro no chat:", e);
        if(document.getElementById('loading')) document.getElementById('loading').remove();
        addMessage("bot", "Desculpe, tive um problema ao processar sua pergunta."); 
    }
}