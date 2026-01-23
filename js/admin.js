// js/admin.js - Painel do Gerente
import { db, auth, storage } from './config.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let currentFiles = [];
let currentManualId = null;
let currentUserId = null;
let newManualFile = null; // Arquivo selecionado para novo manual

// Função para alternar entre abas do painel
window.switchAdminTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    
    if(tab === 'manuals') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('tab-manuals').classList.remove('hidden');
        loadManualsList();
    } else if(tab === 'users') {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('tab-users').classList.remove('hidden');
        // Carrega pendentes por padrão - atualiza o botão ativo
        const pendingBtn = document.querySelector('.filter-tab-btn');
        if(pendingBtn) {
            filterUsers('pending', pendingBtn);
        } else {
            // Fallback caso o botão não exista ainda
            setTimeout(() => {
                const btn = document.querySelector('.filter-tab-btn');
                if(btn) filterUsers('pending', btn);
            }, 100);
        }
    }
}

// ========== GERENCIAMENTO DE MANUAIS ==========

// Carrega lista de arquivos no select - filtra arquivos inválidos
async function loadManualsList() {
    const select = document.getElementById('admin-select');
    if(!select) {
        console.error("Select não encontrado!");
        return;
    }
    
    select.innerHTML = '<option value="">Selecione um arquivo...</option>';
    
    try {
        const snap = await getDocs(collection(db, "manuais"));
        snap.forEach(docSnapshot => {
            const data = docSnapshot.data();
            const docId = docSnapshot.id;
            
            // Filtra arquivos inválidos: apenas aceita se tiver campo 'name' válido
            // e não for o portal de entrevistas qualificadas (que é hardcoded)
            if(data && data.name && typeof data.name === 'string' && data.name.trim() !== '' && docId !== 'portal-entrevistas-qualificadas') {
                const option = document.createElement('option');
                option.value = docId;
                option.textContent = data.name;
                select.appendChild(option);
            } else {
                console.log("Arquivo inválido ignorado:", docId, data);
            }
        });
        console.log("Lista de arquivos carregada com sucesso");
    } catch(e) {
        console.error("Erro ao carregar arquivos:", e);
    }
}

// Carrega conteúdo do manual selecionado
window.loadManualContent = async function() {
    const select = document.getElementById('admin-select');
    if(!select) {
        console.error("Select de manuais não encontrado!");
        return;
    }
    
    currentManualId = select.value;
    
    if(!currentManualId) {
        const contentSection = document.getElementById('manual-content-section');
        if(contentSection) {
            contentSection.classList.add('hidden');
        }
        currentFiles = [];
        return;
    }
    
    // Mostra a seção de conteúdo
    const contentSection = document.getElementById('manual-content-section');
    if(contentSection) {
        contentSection.classList.remove('hidden');
    }
    
    // Limpa e recarrega arquivos
    currentFiles = [];
    renderFiles();
    
    try {
        const snap = await getDoc(doc(db, "manuais", currentManualId));
        if(snap.exists()) {
            const d = snap.data();
            // Filtra apenas arquivos válidos (com propriedade 'name') e preserva URL se existir
            if(Array.isArray(d.files)) {
                currentFiles = d.files.filter(f => f && f.name && typeof f.name === 'string' && f.name.trim() !== '')
                    .map(f => ({
                        name: f.name,
                        url: f.url || null // Preserva URL se existir
                    }));
            } else {
                currentFiles = [];
            }
            console.log("Arquivo carregado:", currentManualId, "com", currentFiles.length, "arquivo(s) válido(s)");
            
            // Remove arquivos inválidos do banco se houver
            if(Array.isArray(d.files) && d.files.length !== currentFiles.length) {
                console.log("Arquivos inválidos detectados, limpando...");
                await setDoc(doc(db, "manuais", currentManualId), {
                    files: currentFiles
                }, { merge: true });
            }
        } else {
            console.log("Arquivo não encontrado no banco:", currentManualId);
            currentFiles = [];
        }
    } catch(e) {
        console.error("Erro ao carregar arquivo:", e);
        currentFiles = [];
    }
    
    renderFiles();
}

// Mostra formulário para criar novo manual
window.showNewManualForm = function() {
    document.getElementById('new-manual-form').classList.remove('hidden');
}

// Esconde formulário de novo manual
window.hideNewManualForm = function() {
    document.getElementById('new-manual-form').classList.add('hidden');
    document.getElementById('new-manual-name').value = '';
    document.getElementById('new-manual-file-name').textContent = '';
    newManualFile = null;
}

// Lida com seleção de arquivo para novo arquivo
window.handleNewManualFileSelect = function(input) {
    if(!input) {
        console.error("Input de arquivo não encontrado!");
        return;
    }
    
    if(input.files && input.files.length > 0) {
        newManualFile = input.files[0];
        const fileNameDisplay = document.getElementById('new-manual-file-name');
        if(fileNameDisplay && newManualFile.name) {
            fileNameDisplay.textContent = `Arquivo selecionado: ${newManualFile.name}`;
            fileNameDisplay.style.color = '#2e7d32';
        }
        console.log("Arquivo selecionado:", newManualFile.name);
    } else {
        newManualFile = null;
        const fileNameDisplay = document.getElementById('new-manual-file-name');
        if(fileNameDisplay) {
            fileNameDisplay.textContent = '';
        }
    }
}

// Cria novo manual - ID gerado automaticamente baseado no nome
window.createNewManual = async function() {
    const nameInput = document.getElementById('new-manual-name');
    if(!nameInput) {
        showError("Campo de nome não encontrado!");
        return;
    }
    
    const name = nameInput.value.trim();
    
    if(!name) {
        showWarning("Preencha o nome do arquivo!");
        nameInput.focus();
        return;
    }
    
    if(!newManualFile) {
        showWarning("Selecione um arquivo!");
        return;
    }
    
    // Gera ID automaticamente baseado no nome (remove acentos, espaços, caracteres especiais)
    const id = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, '-') // Substitui espaços por hífen
        .replace(/-+/g, '-') // Remove hífens duplicados
        .trim();
    
    if(!id) {
        showWarning("Nome inválido! Use apenas letras, números e espaços.");
        return;
    }
    
    try {
        // Verifica se já existe um manual com este ID
        let finalId = id;
        let counter = 1;
        let check = await getDoc(doc(db, "manuais", finalId));
        while(check.exists()) {
            finalId = `${id}-${counter}`;
            check = await getDoc(doc(db, "manuais", finalId));
            counter++;
        }
        
        // Verifica novamente se o arquivo existe antes de usar
        if(!newManualFile) {
            showError("Arquivo não selecionado. Por favor, selecione um arquivo novamente.");
            return;
        }
        
        // Obtém o nome do arquivo de forma segura
        const fileName = newManualFile.name || 'arquivo-sem-nome';
        
        console.log("Criando arquivo com nome:", name, "ID:", finalId, "Arquivo:", fileName);
        
        // Faz upload do arquivo para Firebase Storage
        showInfo("Fazendo upload do arquivo...");
        const storageRef = ref(storage, `manuais/${finalId}/${Date.now()}_${fileName}`);
        await uploadBytes(storageRef, newManualFile);
        const downloadURL = await getDownloadURL(storageRef);
        
        console.log("Arquivo enviado para Storage, URL:", downloadURL);
        
        // Cria o arquivo com a URL do Storage
        await setDoc(doc(db, "manuais", finalId), {
            name: name,
            files: [{name: fileName, url: downloadURL}], // Salva nome e URL
            createdAt: new Date()
        });
        
        showSuccess(`Arquivo "${name}" criado com sucesso!`);
        
        // Limpa o formulário
        hideNewManualForm();
        
        // Recarrega a lista e seleciona o manual criado
        await loadManualsList();
        
        const select = document.getElementById('admin-select');
        if(select) {
            select.value = finalId;
            // Carrega o conteúdo do manual recém-criado
            await loadManualContent();
        }
        
        console.log("Arquivo criado:", finalId, "com arquivo:", fileName);
    } catch(e) {
        console.error("Erro ao criar manual:", e);
        showError("Erro ao criar arquivo: " + (e.message || "Erro desconhecido"));
    }
}

// Adiciona arquivos à lista e faz upload para Storage
window.handleFileSelect = async function(input) {
    if(!input || !input.files || input.files.length === 0) {
        showWarning("Nenhum arquivo selecionado!");
        return;
    }
    
    if(!currentManualId) {
        showWarning("Selecione um arquivo primeiro!");
        return;
    }
    
    showInfo(`Fazendo upload de ${input.files.length} arquivo(s)...`);
    
    // Faz upload de cada arquivo para Storage
    for(const file of Array.from(input.files)) {
        // Verifica se o arquivo já não está na lista
        const exists = currentFiles.some(existing => existing.name === file.name);
        if(exists) {
            console.log("Arquivo já existe na lista:", file.name);
            continue;
        }
        
        try {
            // Faz upload para Storage
            const storageRef = ref(storage, `manuais/${currentManualId}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            
            // Adiciona à lista com URL
            currentFiles.push({name: file.name, url: downloadURL});
            console.log("Arquivo enviado:", file.name, "URL:", downloadURL);
        } catch(e) {
            console.error("Erro ao fazer upload de", file.name, ":", e);
            showError(`Erro ao fazer upload de ${file.name}: ${e.message}`);
        }
    }
    
    renderFiles();
    
    // Limpa o input para permitir selecionar o mesmo arquivo novamente
    input.value = '';
    
    if(input.files.length > 0) {
        showSuccess(`${input.files.length} arquivo(s) adicionado(s) com sucesso!`);
    }
}

window.removeFile = function(i) {
    if(i < 0 || i >= currentFiles.length) {
        console.error("Índice inválido para remover arquivo:", i);
        return;
    }
    
    const fileName = currentFiles[i].name;
    currentFiles.splice(i, 1);
    renderFiles();
    console.log("Arquivo removido:", fileName);
}

function renderFiles() {
    const list = document.getElementById('admin-file-list');
    if(!list) {
        console.error("Lista de arquivos não encontrada!");
        return;
    }
    
    list.innerHTML = "";
    
    if(currentFiles.length === 0) {
        list.innerHTML = "<li style='color:#999; padding: 10px;'>Nenhum arquivo adicionado</li>";
        return;
    }
    
    currentFiles.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        
        const span = document.createElement('span');
        span.textContent = f.name;
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-file';
        removeBtn.textContent = 'X';
        removeBtn.onclick = () => removeFile(i);
        removeBtn.title = 'Remover arquivo';
        
        li.appendChild(span);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

// Salva arquivo (os uploads já foram feitos em handleFileSelect)
window.saveManual = async function() {
    if(!currentManualId) {
        showWarning("Selecione um arquivo primeiro!");
        return;
    }
    
    if(currentFiles.length === 0) {
        const confirmed = await showConfirm("Nenhum arquivo adicionado. Deseja salvar mesmo assim?");
        if(!confirmed) {
            return;
        }
    }
    
    try {
        // Busca o nome do manual para preservá-lo
        const manualDoc = await getDoc(doc(db, "manuais", currentManualId));
        const existingData = manualDoc.exists() ? manualDoc.data() : {};
        
        // Salva os arquivos (já com URLs do Storage)
        await setDoc(doc(db, "manuais", currentManualId), {
            name: existingData.name || currentManualId,
            files: currentFiles, // Já contém {name, url}
            updatedAt: new Date()
        }, { merge: true });
        
        showSuccess("Arquivo salvo com sucesso! " + currentFiles.length + " arquivo(s) adicionado(s).");
    } catch(e) {
        console.error("Erro ao salvar:", e);
        showError("Erro ao salvar arquivo: " + (e.message || "Erro desconhecido"));
    }
}

// Exclui arquivo
window.deleteManual = async function() {
    if(!currentManualId) {
        showWarning("Selecione um arquivo primeiro!");
        return;
    }
    
    // Busca o nome do arquivo para exibir na confirmação
    let fileName = currentManualId;
    try {
        const fileDoc = await getDoc(doc(db, "manuais", currentManualId));
        if(fileDoc.exists()) {
            fileName = fileDoc.data().name || currentManualId;
        }
    } catch(e) {
        console.error("Erro ao buscar nome do arquivo:", e);
    }
    
    const confirmed = await showConfirm(
        `Tem certeza que deseja excluir o arquivo "${fileName}"?<br><br><strong>Esta ação não pode ser desfeita!</strong>`,
        "Excluir",
        "Cancelar"
    );
    
    if(!confirmed) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, "manuais", currentManualId));
        showSuccess("Arquivo excluído com sucesso!");
        
        // Limpa as variáveis e interface
        currentManualId = null;
        currentFiles = [];
        
        const select = document.getElementById('admin-select');
        if(select) select.value = '';
        
        const contentSection = document.getElementById('manual-content-section');
        if(contentSection) contentSection.classList.add('hidden');
        
        // Recarrega a lista de arquivos
        loadManualsList();
        
        console.log("Arquivo excluído:", fileName);
    } catch(e) {
        console.error("Erro ao excluir:", e);
        showError("Erro ao excluir arquivo: " + (e.message || "Erro desconhecido"));
    }
}

// ========== GERENCIAMENTO DE USUÁRIOS ==========

// Filtra usuários por status
window.filterUsers = async function(status, buttonElement) {
    // Atualiza botões de filtro
    document.querySelectorAll('.filter-tab-btn').forEach(b => b.classList.remove('active'));
    if(buttonElement) {
        buttonElement.classList.add('active');
    }
    
    const list = document.getElementById('user-list');
    list.innerHTML = "<li>Carregando...</li>";
    
    try {
        const q = query(collection(db, "users"), where("status", "==", status));
        const snap = await getDocs(q);
        list.innerHTML = "";
        
        if(snap.empty) {
            list.innerHTML = `<li style='color:#999;'>Nenhum usuário ${status === 'pending' ? 'pendente' : 'cadastrado'}.</li>`;
            return;
        }
        
        snap.forEach(d => {
            const u = d.data();
            const isAdminUser = u.role === 'admin';
            
            const li = document.createElement('li');
            li.className = 'user-item';
            
            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            
            const emailSpan = document.createElement('span');
            emailSpan.className = 'user-email';
            emailSpan.textContent = u.email;
            
            const roleSpan = document.createElement('span');
            roleSpan.className = 'user-role';
            roleSpan.textContent = isAdminUser ? 'Administrador' : (u.role || 'user');
            
            userInfo.appendChild(emailSpan);
            userInfo.appendChild(roleSpan);
            
            const userActions = document.createElement('div');
            userActions.className = 'user-actions';
            
            // Admin NÃO tem opções de edição, aprovação ou exclusão — só aparece na lista
            if(!isAdminUser) {
                if(status === 'pending') {
                    const approveBtn = document.createElement('button');
                    approveBtn.className = 'glass-btn btn-approve';
                    approveBtn.textContent = 'Aprovar';
                    approveBtn.onclick = () => approveUser(d.id);
                    userActions.appendChild(approveBtn);
                }
                
                const editBtn = document.createElement('button');
                editBtn.className = 'glass-btn btn-edit';
                editBtn.textContent = 'Editar';
                editBtn.onclick = () => editUser(d.id, u.email);
                userActions.appendChild(editBtn);
            }
            
            li.appendChild(userInfo);
            li.appendChild(userActions);
            list.appendChild(li);
        });
    } catch(e) {
        console.error("Erro ao carregar usuários:", e);
        list.innerHTML = "<li>Erro ao carregar usuários.</li>";
    }
}

// Aprova usuário pendente
window.approveUser = async function(uid) {
    try {
        await updateDoc(doc(db, "users", uid), { status: 'approved' });
        showSuccess("Usuário aprovado com sucesso!");
        // Recarrega a lista de pendentes mantendo o botão ativo
        const pendingBtn = document.querySelector('.filter-tab-btn');
        if(pendingBtn && pendingBtn.textContent.includes('Pendentes')) {
            filterUsers('pending', pendingBtn);
        }
    } catch(e) {
        console.error("Erro ao aprovar:", e);
        showError("Erro ao aprovar usuário!");
    }
}

// Abre modal para editar usuário
window.editUser = function(uid, email) {
    console.log("editUser chamado - UID:", uid, "Email:", email);
    currentUserId = uid;
    
    const modal = document.getElementById('edit-user-modal');
    const emailInput = document.getElementById('edit-user-email');
    
    if(!modal) {
        console.error("Modal edit-user-modal não encontrado!");
        showError("Erro: Modal não encontrado! Verifique o console para mais detalhes.");
        return;
    }
    
    if(!emailInput) {
        console.error("Campo edit-user-email não encontrado!");
        showError("Erro: Campo de e-mail não encontrado!");
        return;
    }
    
    // Preenche o campo de email
    emailInput.value = email || '';
    
    // Remove a classe hidden para exibir o modal - FORÇA a exibição
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Força display flex
    modal.style.visibility = 'visible'; // Força visibilidade
    modal.style.opacity = '1'; // Força opacidade
    
    // Foca no campo de email após um pequeno delay
    setTimeout(() => {
        emailInput.focus();
        emailInput.select(); // Seleciona o texto para facilitar edição
    }, 150);
    
    console.log("Modal de edição aberto com sucesso para:", email);
    console.log("Modal visível:", !modal.classList.contains('hidden'));
}

// Fecha modal de edição
window.closeEditUserModal = function() {
    const modal = document.getElementById('edit-user-modal');
    const emailInput = document.getElementById('edit-user-email');
    
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none'; // Força esconder
        modal.style.visibility = 'hidden';
    }
    
    if(emailInput) {
        emailInput.value = '';
    }
    
    currentUserId = null;
    console.log("Modal de edição fechado");
}

// Salva novo email do usuário (Authentication + Firestore via API)
window.saveUserEmail = async function() {
    if(!currentUserId) {
        showWarning("Nenhum usuário selecionado!");
        return;
    }
    
    const emailInput = document.getElementById('edit-user-email');
    if(!emailInput) {
        showError("Campo de e-mail não encontrado!");
        return;
    }
    
    const newEmail = emailInput.value.trim();
    if(!newEmail || !newEmail.includes('@')) {
        showWarning("E-mail inválido!");
        return;
    }
    
    try {
        const res = await fetch("/api/admin-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "updateEmail", uid: currentUserId, newEmail })
        });
        const data = await res.json();
        
        if(!res.ok) {
            throw new Error(data.error || "Erro ao atualizar e-mail");
        }
        
        showSuccess("E-mail atualizado no Authentication e no Firestore!");
        closeEditUserModal();
        
        const activeBtn = document.querySelector('.filter-tab-btn.active');
        if(activeBtn) {
            const status = activeBtn.textContent.includes('Pendentes') ? 'pending' : 'approved';
            filterUsers(status, activeBtn);
        } else {
            const approvedBtn = document.querySelectorAll('.filter-tab-btn')[1];
            if(approvedBtn) filterUsers('approved', approvedBtn);
        }
    } catch(e) {
        console.error("Erro ao atualizar email:", e);
        showError("Erro ao atualizar e-mail: " + (e.message || "Erro desconhecido"));
    }
}

// Envia email de reset de senha
window.sendPasswordReset = async function() {
    if(!currentUserId) {
        showWarning("Nenhum usuário selecionado!");
        return;
    }
    
    const emailInput = document.getElementById('edit-user-email');
    if(!emailInput) {
        showError("Campo de e-mail não encontrado!");
        return;
    }
    
    const email = emailInput.value.trim();
    if(!email || !email.includes('@')) {
        showWarning("E-mail inválido!");
        return;
    }
    
    const confirmed = await showConfirm(
        `Deseja enviar um e-mail de redefinição de senha para:<br><strong>${email}</strong>?`,
        "Enviar",
        "Cancelar"
    );
    
    if(!confirmed) {
        return;
    }
    
    try {
        // Envia o email de reset de senha via Firebase Auth
        await sendPasswordResetEmail(auth, email);
        showSuccess("E-mail de redefinição de senha enviado com sucesso para: " + email);
    } catch(e) {
        console.error("Erro ao enviar email:", e);
        let errorMsg = "Erro ao enviar e-mail.";
        if(e.code === 'auth/user-not-found') {
            errorMsg = "Usuário não encontrado. Verifique se o e-mail está correto.";
        } else if(e.code === 'auth/invalid-email') {
            errorMsg = "E-mail inválido.";
        } else if(e.message) {
            errorMsg = "Erro: " + e.message;
        }
        showError(errorMsg);
    }
}

// Exclui usuário
window.deleteUser = async function() {
    if(!currentUserId) {
        showWarning("Nenhum usuário selecionado!");
        return;
    }
    
    const emailInput = document.getElementById('edit-user-email');
    const email = emailInput ? emailInput.value.trim() : 'este usuário';
    
    const confirmed1 = await showConfirm(
        `⚠️ <strong>ATENÇÃO:</strong> Deseja realmente EXCLUIR o usuário:<br><strong>${email}</strong>?<br><br>Esta ação NÃO pode ser desfeita!`,
        "Continuar",
        "Cancelar"
    );
    
    if(!confirmed1) {
        return;
    }
    
    const confirmed2 = await showConfirm(
        `Confirma a <strong>EXCLUSÃO PERMANENTE</strong> do usuário <strong>${email}</strong>?`,
        "Excluir",
        "Cancelar"
    );
    
    if(!confirmed2) {
        return;
    }
    
    try {
        const res = await fetch("/api/admin-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deleteUser", uid: currentUserId })
        });
        const data = await res.json();
        
        if(!res.ok) {
            throw new Error(data.error || "Erro ao excluir usuário");
        }
        
        showSuccess("Usuário excluído do Authentication e do Firestore!");
        closeEditUserModal();
        
        const activeBtn = document.querySelector('.filter-tab-btn.active');
        if(activeBtn) {
            const status = activeBtn.textContent.includes('Pendentes') ? 'pending' : 'approved';
            filterUsers(status, activeBtn);
        }
    } catch(e) {
        console.error("Erro ao excluir usuário:", e);
        showError("Erro ao excluir usuário: " + (e.message || "Erro desconhecido"));
    }
}

// ========== INICIALIZAÇÃO ==========

// Botão de abrir modal
const btn = document.getElementById('btn-admin');
if(btn) {
    btn.onclick = () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        loadManualsList();
    };
}

window.closeAdmin = () => {
    document.getElementById('admin-modal').classList.add('hidden');
}
