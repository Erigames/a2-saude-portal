// js/beneficiarios-validator.js
// Verificador de Beneficiários

import { auth } from './config.js';

const SHEET_ID = '1iqSIy7R1vyFizribGrO7QpF8W8u--zDUcAv0nDQ3N6s';
const DEFAULT_SHEET = 'Dados';
const DEFAULT_COLUMN_CPF = 'CPF';
const DEFAULT_COLUMN_CSV = 'NUM_CPF';
const COLUMN_PARECER = 'Parecer Técnico';
const COLUMN_OBSERVACOES = 'Observações';

let sheetData = null;
let csvData = null;
let currentParecerIndex = 0;
let parecerGroups = [];

// Função auxiliar para normalizar strings (remove espaços, caracteres invisíveis, etc.)
function normalizeString(str) {
    if (!str) return '';
    return str
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces e BOM
        .replace(/\s+/g, '') // Remove todos os espaços
        .toUpperCase()
        .trim();
}

// Renderiza a interface do Verificador de Beneficiários
export function renderBeneficiariosValidator() {
    const mediaContainer = document.getElementById('media-container');
    const playlist = document.getElementById('playlist-container');
    
    playlist.innerHTML = "";
    playlist.classList.add('hidden');
    
    mediaContainer.innerHTML = `
        <div class="validator-container">
            <h3 class="validator-title">Validador de Inclusão CAEQ</h3>
            
            <!-- Configuração da Planilha -->
            <div class="validator-section">
                <h4>Google Sheets | Arquivo Base - Parecer Técnico</h4>
                <div class="input-group">
                    <label>Aba da Planilha:</label>
                    <input type="text" id="sheet-tab" value="${DEFAULT_SHEET}" placeholder="Nome da aba">
                </div>
                <div class="input-group">
                    <label>Coluna de busca pelo CPF - Cabeçalho</label>
                    <input type="text" id="sheet-column" value="${DEFAULT_COLUMN_CPF}" placeholder="Nome da coluna">
                </div>
                <button class="glass-btn" onclick="loadSheetData()">📊 Carregar Dados da Planilha</button>
                <div id="sheet-status" class="status-message"></div>
            </div>
            
            <!-- Upload do CSV -->
            <div class="validator-section">
                <h4>📄 Inclusão de Beneficiários (CSV)</h4>
                <div class="input-group">
                    <label>Coluna de CPF no CSV (Cabeçalho na Linha 1):</label>
                    <input type="text" id="csv-column" value="${DEFAULT_COLUMN_CSV}" placeholder="Nome da coluna">
                </div>
                <div class="file-upload-area">
                    <button class="glass-btn upload-btn" onclick="document.getElementById('csv-file-input').click()">
                        📂 Selecionar Arquivo CSV
                    </button>
                    <input type="file" id="csv-file-input" accept=".csv" style="display: none;" onchange="handleCSVUpload(this)">
                    <p id="csv-file-name" class="tip-text" style="margin-top: 10px;"></p>
                </div>
                <div id="csv-status" class="status-message"></div>
            </div>
            
            <!-- Botão de Validação -->
            <div id="validation-section" class="validator-section hidden">
                <button class="glass-btn btn-primary" onclick="validateBeneficiarios()" style="width: 100%; padding: 15px; font-size: 1.1rem;">
                    ✅ Validar Beneficiários
                </button>
            </div>
            
            <!-- Resultados -->
            <div id="results-container" class="results-container hidden">
                <div class="results-header">
                    <h4>Resultados da Validação</h4>
                    <div class="parecer-navigation">
                        <button class="nav-btn" onclick="previousParecer()" id="prev-btn">← Anterior</button>
                        <span id="parecer-counter">1 / 1</span>
                        <button class="nav-btn" onclick="nextParecer()" id="next-btn">Próximo →</button>
                    </div>
                </div>
                <div id="parecer-results" class="parecer-results"></div>
            </div>
        </div>
    `;
    
    document.getElementById('input-area').classList.remove('hidden');
}

// Carrega dados da planilha Google Sheets usando API autenticada
window.loadSheetData = async function() {
    const sheetTab = document.getElementById('sheet-tab').value.trim() || DEFAULT_SHEET;
    const columnName = document.getElementById('sheet-column').value.trim() || DEFAULT_COLUMN_CPF;
    const statusDiv = document.getElementById('sheet-status');
    
    statusDiv.innerHTML = '<span class="loading">Carregando dados da planilha...</span>';
    
    try {
        // Verifica se o usuário está autenticado
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Usuário não autenticado. Faça login para acessar a planilha.');
        }
        
        // Obtém o token de autenticação do Firebase
        const idToken = await user.getIdToken();
        
        // Faz requisição para a API serverless que acessa a planilha privada
        const response = await fetch('/api/sheets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                idToken: idToken,
                sheetId: SHEET_ID,
                sheetTab: sheetTab
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
            
            if (response.status === 401) {
                throw new Error('Sessão expirada. Faça login novamente.');
            } else if (response.status === 403) {
                throw new Error('Acesso negado. Seu e-mail não está autorizado para acessar esta planilha.');
            } else if (response.status === 404) {
                throw new Error('Planilha vazia ou aba não encontrada.');
            } else {
                throw new Error(errorData.error || `Erro ao acessar a planilha. Status: ${response.status}`);
            }
        }
        
        const csvText = await response.text();
        
        if (!csvText || csvText.trim().length === 0) {
            throw new Error('Planilha vazia ou sem dados');
        }
        
        const rows = parseCSV(csvText);
        
        if (rows.length === 0) {
            throw new Error('Planilha vazia ou aba não encontrada');
        }
        
        // Encontra a coluna de CPF no cabeçalho (linha 0)
        const headerRow = rows[0];
        
        const normalizedColumnName = normalizeString(columnName);
        let cpfColumnIndex = -1;
        
        for (let i = 0; i < headerRow.length; i++) {
            const normalizedHeader = normalizeString(headerRow[i]);
            if (normalizedHeader === normalizedColumnName) {
                cpfColumnIndex = i;
                break;
            }
        }
        
        // Se não encontrou, tenta busca parcial
        if (cpfColumnIndex === -1) {
            for (let i = 0; i < headerRow.length; i++) {
                const cell = headerRow[i];
                const cellUpper = cell.toUpperCase().trim();
                const columnUpper = columnName.toUpperCase().trim();
                
                if (cellUpper === columnUpper || 
                    cellUpper.replace(/\s+/g, '') === columnUpper.replace(/\s+/g, '') ||
                    cellUpper.replace(/[_\s-]/g, '') === columnUpper.replace(/[_\s-]/g, '')) {
                    cpfColumnIndex = i;
                    break;
                }
            }
        }
        
        if (cpfColumnIndex === -1) {
            const foundColumns = headerRow
                .map((col, idx) => `"${col.trim()}" (índice ${idx})`)
                .filter(col => col.trim() !== '""')
                .join(', ');
            throw new Error(`Coluna "${columnName}" não encontrada no cabeçalho. Colunas disponíveis: ${foundColumns || 'nenhuma'}`);
        }
        
        // Encontra as colunas de Parecer Técnico e Observações
        const normalizedParecer = normalizeString(COLUMN_PARECER);
        const normalizedObservacoes = normalizeString(COLUMN_OBSERVACOES);
        
        let parecerColumnIndex = -1;
        let observacoesColumnIndex = -1;
        
        for (let i = 0; i < headerRow.length; i++) {
            const normalizedHeader = normalizeString(headerRow[i]);
            if (normalizedHeader === normalizedParecer) {
                parecerColumnIndex = i;
            }
            if (normalizedHeader === normalizedObservacoes) {
                observacoesColumnIndex = i;
            }
        }
        
        // Tenta busca parcial se não encontrou
        if (parecerColumnIndex === -1) {
            for (let i = 0; i < headerRow.length; i++) {
                const cell = headerRow[i];
                const cellUpper = cell.toUpperCase().trim();
                const parecerUpper = COLUMN_PARECER.toUpperCase().trim();
                const normalizedCell = normalizeString(cell);
                if (cellUpper === parecerUpper || 
                    normalizedCell === normalizedParecer ||
                    (cellUpper.includes('PARECER') && cellUpper.includes('TECNICO'))) {
                    parecerColumnIndex = i;
                    break;
                }
            }
        }
        
        if (observacoesColumnIndex === -1) {
            for (let i = 0; i < headerRow.length; i++) {
                const cell = headerRow[i];
                const cellUpper = cell.toUpperCase().trim();
                const obsUpper = COLUMN_OBSERVACOES.toUpperCase().trim();
                const normalizedCell = normalizeString(cell);
                if (cellUpper === obsUpper || 
                    normalizedCell === normalizedObservacoes ||
                    cellUpper.includes('OBSERVACOES') || cellUpper.includes('OBSERVAÇÕES')) {
                    observacoesColumnIndex = i;
                    break;
                }
            }
        }
        
        // Extrai os CPFs da coluna (a partir da linha 1, pois linha 0 é cabeçalho)
        const cpfs = [];
        for (let i = 1; i < rows.length; i++) {
            const cpf = rows[i][cpfColumnIndex]?.trim();
            if (cpf) {
                cpfs.push({
                    cpf: cpf,
                    rowIndex: i,
                    parecer: parecerColumnIndex !== -1 ? (rows[i][parecerColumnIndex]?.trim() || '') : '',
                    observacoes: observacoesColumnIndex !== -1 ? (rows[i][observacoesColumnIndex]?.trim() || '') : '',
                    fullRow: rows[i] // Guarda a linha completa para acesso a outras colunas
                });
            }
        }
        
        if (cpfs.length === 0) {
            throw new Error('Nenhum CPF encontrado na coluna especificada');
        }
        
        // Armazena os dados
        sheetData = {
            rows: rows,
            headerRow: headerRow,
            cpfs: cpfs,
            cpfColumnIndex: cpfColumnIndex,
            parecerColumnIndex: parecerColumnIndex,
            observacoesColumnIndex: observacoesColumnIndex
        };
        
        statusDiv.innerHTML = `<span class="success">✅ Concluído: ${cpfs.length} CPF(s) encontrado(s)</span>`;
        
        // Mostra o botão de validação se ambos os dados estiverem carregados
        if (sheetData && csvData) {
            document.getElementById('validation-section').classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Erro ao carregar planilha:', error);
        statusDiv.innerHTML = `<span class="error">❌ Erro: ${error.message}</span>`;
        sheetData = null;
    }
};

// Processa upload do arquivo CSV
window.handleCSVUpload = function(input) {
    const file = input.files[0];
    const statusDiv = document.getElementById('csv-status');
    const fileNameDiv = document.getElementById('csv-file-name');
    
    if (!file) {
        return;
    }
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
        statusDiv.innerHTML = '<span class="error">❌ Erro: O arquivo deve ser um CSV</span>';
        return;
    }
    
    fileNameDiv.textContent = `Arquivo selecionado: ${file.name}`;
    statusDiv.innerHTML = '<span class="loading">Processando arquivo CSV...</span>';
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let csvText = e.target.result;
            
            // Remove BOM (Byte Order Mark) se presente
            if (csvText.charCodeAt(0) === 0xFEFF) {
                csvText = csvText.slice(1);
            }
            
            const rows = parseCSV(csvText);
            
            if (rows.length === 0) {
                throw new Error('Arquivo CSV vazio');
            }
            
            const columnName = document.getElementById('csv-column').value.trim() || DEFAULT_COLUMN_CSV;
            const headerRow = rows[0];
            
            // Busca a coluna com normalização mais robusta
            let cpfColumnIndex = -1;
            const normalizedColumnName = normalizeString(columnName);
            
            for (let i = 0; i < headerRow.length; i++) {
                const normalizedHeader = normalizeString(headerRow[i]);
                if (normalizedHeader === normalizedColumnName) {
                    cpfColumnIndex = i;
                    break;
                }
            }
            
            // Se não encontrou, tenta busca parcial (caso tenha espaços ou caracteres extras)
            if (cpfColumnIndex === -1) {
                for (let i = 0; i < headerRow.length; i++) {
                    const cell = headerRow[i];
                    const cellUpper = cell.toUpperCase().trim();
                    const columnUpper = columnName.toUpperCase().trim();
                    
                    // Tenta match exato após normalização básica
                    if (cellUpper === columnUpper || 
                        cellUpper.replace(/\s+/g, '') === columnUpper.replace(/\s+/g, '') ||
                        cellUpper.replace(/[_\s-]/g, '') === columnUpper.replace(/[_\s-]/g, '')) {
                        cpfColumnIndex = i;
                        break;
                    }
                }
            }
            
            if (cpfColumnIndex === -1) {
                // Lista as colunas encontradas para debug
                const foundColumns = headerRow
                    .map((col, idx) => `"${col.trim()}" (índice ${idx})`)
                    .filter(col => col.trim() !== '""')
                    .join(', ');
                
                throw new Error(
                    `Coluna "${columnName}" não encontrada no cabeçalho do CSV. ` +
                    `Colunas encontradas: ${foundColumns || 'nenhuma'}`
                );
            }
            
            // Extrai os CPFs e dados completos das linhas
            const csvRows = [];
            for (let i = 1; i < rows.length; i++) {
                const cpf = rows[i][cpfColumnIndex]?.trim();
                if (cpf) {
                    csvRows.push({
                        cpf: cpf,
                        rowIndex: i,
                        fullRow: rows[i],
                        headerRow: headerRow
                    });
                }
            }
            
            if (csvRows.length === 0) {
                throw new Error('Nenhum CPF encontrado na coluna especificada do CSV');
            }
            
            csvData = {
                rows: rows,
                headerRow: headerRow,
                csvRows: csvRows,
                cpfColumnIndex: cpfColumnIndex
            };
            
            statusDiv.innerHTML = `<span class="success">✅ Concluído: ${csvRows.length} CPF(s) encontrado(s)</span>`;
            
            // Mostra o botão de validação se ambos os dados estiverem carregados
            if (sheetData && csvData) {
                document.getElementById('validation-section').classList.remove('hidden');
            }
            
        } catch (error) {
            console.error('Erro ao processar CSV:', error);
            statusDiv.innerHTML = `<span class="error">❌ Erro: ${error.message}</span>`;
            csvData = null;
        }
    };
    
    reader.onerror = function() {
        statusDiv.innerHTML = '<span class="error">❌ Erro ao ler o arquivo CSV</span>';
        csvData = null;
    };
    
    reader.readAsText(file, 'UTF-8');
};

// Valida e cruza os dados
window.validateBeneficiarios = function() {
    if (!sheetData || !csvData) {
        alert('Por favor, carregue os dados da planilha e faça upload do CSV primeiro.');
        return;
    }
    
    // Cria um mapa de CPFs da planilha para acesso rápido
    const sheetCpfMap = new Map();
    sheetData.cpfs.forEach(item => {
        const cpfNormalized = normalizeCPF(item.cpf);
        if (!sheetCpfMap.has(cpfNormalized)) {
            sheetCpfMap.set(cpfNormalized, []);
        }
        sheetCpfMap.get(cpfNormalized).push(item);
    });
    
    // Cruza os dados: CPFs que estão tanto na planilha quanto no CSV
    const matchedData = [];
    
    csvData.csvRows.forEach(csvRow => {
        const cpfNormalized = normalizeCPF(csvRow.cpf);
        const sheetMatches = sheetCpfMap.get(cpfNormalized);
        
        if (sheetMatches && sheetMatches.length > 0) {
            // Para cada correspondência na planilha
            sheetMatches.forEach(sheetMatch => {
                matchedData.push({
                    cpf: csvRow.cpf,
                    parecer: sheetMatch.parecer || 'Sem Parecer',
                    observacoes: sheetMatch.observacoes || '',
                    csvRow: csvRow.fullRow,
                    csvHeader: csvRow.headerRow,
                    sheetRow: sheetMatch.fullRow
                });
            });
        }
    });
    
    if (matchedData.length === 0) {
        alert('Nenhum CPF correspondente encontrado entre a planilha e o CSV.');
        return;
    }
    
    // Agrupa por parecer
    const parecerMap = new Map();
    matchedData.forEach(item => {
        const parecer = item.parecer || 'Sem Parecer';
        if (!parecerMap.has(parecer)) {
            parecerMap.set(parecer, []);
        }
        parecerMap.get(parecer).push(item);
    });
    
    // Converte para array e ordena
    parecerGroups = Array.from(parecerMap.entries()).map(([parecer, items]) => ({
        parecer: parecer,
        items: items
    }));
    
    currentParecerIndex = 0;
    displayResults();
};

// Exibe os resultados
function displayResults() {
    const resultsContainer = document.getElementById('results-container');
    const parecerResults = document.getElementById('parecer-results');
    const counter = document.getElementById('parecer-counter');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    resultsContainer.classList.remove('hidden');
    
    if (parecerGroups.length === 0) {
        parecerResults.innerHTML = '<p>Nenhum resultado encontrado.</p>';
        return;
    }
    
    // Atualiza contador
    counter.textContent = `${currentParecerIndex + 1} / ${parecerGroups.length}`;
    
    // Habilita/desabilita botões de navegação
    prevBtn.disabled = currentParecerIndex === 0;
    nextBtn.disabled = currentParecerIndex === parecerGroups.length - 1;
    
    // Exibe o parecer atual
    const currentGroup = parecerGroups[currentParecerIndex];
    const headerRow = csvData.headerRow;
    
    // Identifica colunas que têm pelo menos um valor não vazio
    const columnsWithData = new Set();
    columnsWithData.add(csvData.cpfColumnIndex); // Sempre inclui CPF
    
    currentGroup.items.forEach(item => {
        headerRow.forEach((header, index) => {
            if (index !== csvData.cpfColumnIndex && item.csvRow[index] && item.csvRow[index].trim()) {
                columnsWithData.add(index);
            }
        });
    });
    
    let html = `
        <div class="parecer-group">
            <h5 class="parecer-title">Parecer: ${currentGroup.parecer}</h5>
            <p class="parecer-count">Total de CPFs: ${currentGroup.items.length}</p>
            <div class="table-container">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>CPF</th>
    `;
    
    // Adiciona apenas colunas com dados (exceto a coluna de CPF que já está)
    headerRow.forEach((header, index) => {
        if (index !== csvData.cpfColumnIndex && header.trim() && columnsWithData.has(index)) {
            html += `<th>${header.trim()}</th>`;
        }
    });
    
    html += `
                            <th class="highlight-col">Observações</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Adiciona as linhas
    currentGroup.items.forEach(item => {
        const isDeclinio = item.parecer && item.parecer.toLowerCase().includes('declínio técnico');
        const rowClass = isDeclinio ? 'declinio-tecnico' : '';
        html += `<tr class="${rowClass}">`;
        html += `<td>${item.cpf}</td>`;
        
        // Adiciona apenas colunas com dados (exceto CPF)
        headerRow.forEach((header, index) => {
            if (index !== csvData.cpfColumnIndex && header.trim() && columnsWithData.has(index)) {
                const value = item.csvRow[index] || '';
                html += `<td>${value}</td>`;
            }
        });
        
        html += `<td class="highlight-col">${item.observacoes || '-'}</td>`;
        html += '</tr>';
    });
    
    html += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 15px; text-align: center; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button class="glass-btn" onclick="downloadValidatedCSV()" style="padding: 10px 20px;">
                    📥 Baixar CSV Validado
                </button>
                <button class="glass-btn" onclick="downloadColoredHTML()" style="padding: 10px 20px;">
                    🎨 Baixar HTML Colorido
                </button>
            </div>
        </div>
    `;
    
    parecerResults.innerHTML = html;
}

// Navegação entre pareceres
window.previousParecer = function() {
    if (currentParecerIndex > 0) {
        currentParecerIndex--;
        displayResults();
    }
};

window.nextParecer = function() {
    if (currentParecerIndex < parecerGroups.length - 1) {
        currentParecerIndex++;
        displayResults();
    }
};

// Normaliza CPF (remove formatação)
function normalizeCPF(cpf) {
    return cpf.replace(/[^\d]/g, '');
}

// Gera e baixa CSV validado com destaque para Declínio Técnico
window.downloadValidatedCSV = function() {
    if (!csvData || !sheetData || parecerGroups.length === 0) {
        alert('Por favor, valide os beneficiários primeiro.');
        return;
    }
    
    // Cria um mapa de CPFs com seus pareceres e observações
    const cpfDataMap = new Map();
    parecerGroups.forEach(group => {
        group.items.forEach(item => {
            cpfDataMap.set(normalizeCPF(item.cpf), {
                parecer: item.parecer,
                observacoes: item.observacoes
            });
        });
    });
    
    // Prepara o CSV com todas as linhas do CSV original
    const headerRow = [...csvData.headerRow];
    const rows = csvData.rows;
    
    // Adiciona colunas de validação
    headerRow.push('Parecer Técnico');
    headerRow.push('Observações');
    headerRow.push('Status Validação');
    
    // Usa ponto e vírgula como separador padrão (padrão brasileiro)
    const separator = ';';
    
    // Cria o conteúdo do CSV
    let csvContent = '';
    
    // Adiciona o cabeçalho
    csvContent += headerRow.map(h => {
        const cell = (h || '').toString();
        // Se contém vírgula, ponto e vírgula ou quebra de linha, envolve em aspas
        if (cell.includes(separator) || cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
            const escaped = cell.replace(/"/g, '""');
            return `"${escaped}"`;
        }
        return cell;
    }).join(separator) + '\n';
    
    // Adiciona as linhas
    for (let i = 1; i < rows.length; i++) {
        const row = [...rows[i]];
        const cpf = row[csvData.cpfColumnIndex];
        const normalizedCpf = normalizeCPF(cpf);
        const data = cpfDataMap.get(normalizedCpf);
        
        if (data) {
            // Adiciona parecer e observações
            row.push(data.parecer || '');
            row.push(data.observacoes || '');
            
            // Verifica se é Declínio Técnico
            const isDeclinio = data.parecer && data.parecer.toLowerCase().includes('declínio técnico');
            row.push(isDeclinio ? 'DECLÍNIO TÉCNICO' : 'OK');
        } else {
            // CPF não encontrado na validação
            row.push('');
            row.push('');
            row.push('NÃO VALIDADO');
        }
        
        // Adiciona as células da linha
        const csvRow = row.map(cell => {
            const cellStr = (cell || '').toString();
            // Se contém vírgula, ponto e vírgula ou quebra de linha, envolve em aspas
            if (cellStr.includes(separator) || cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
                const escaped = cellStr.replace(/"/g, '""');
                return `"${escaped}"`;
            }
            return cellStr;
        }).join(separator);
        
        csvContent += csvRow + '\n';
    }
    
    // Gera também um HTML formatado que pode ser aberto no Excel com cores
    generateFormattedHTML(headerRow, rows, cpfDataMap);
    
    // Cria o blob e faz o download do CSV
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `beneficiarios_validados_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Gera HTML formatado que pode ser aberto no Excel com cores
function generateFormattedHTML(headerRow, rows, cpfDataMap) {
    // Adiciona colunas extras ao header
    const fullHeaderRow = [...headerRow, 'Parecer Técnico', 'Observações', 'Status Validação'];
    
    let htmlContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <meta name="ProgId" content="Excel.Sheet">
    <meta name="Generator" content="Microsoft Excel">
    <style>
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th { background-color: #AEC6CF; color: #333; padding: 6px; text-align: left; border: 1px solid #ddd; font-weight: bold; }
        td { padding: 4px 6px; border: 1px solid #ddd; }
        .declinio-tecnico { background-color: #ffcccc !important; }
        .declinio-tecnico td { background-color: #ffcccc !important; color: #000000 !important; }
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>
`;
    
    fullHeaderRow.forEach(header => {
        const escaped = (header || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
        htmlContent += `                <th>${escaped}</th>\n`;
    });
    
    htmlContent += `            </tr>
        </thead>
        <tbody>
`;
    
    for (let i = 1; i < rows.length; i++) {
        const row = [...rows[i]];
        const cpf = row[csvData.cpfColumnIndex];
        const normalizedCpf = normalizeCPF(cpf);
        const data = cpfDataMap.get(normalizedCpf);
        
        const isDeclinio = data && data.parecer && data.parecer.toLowerCase().includes('declínio técnico');
        const rowClass = isDeclinio ? ' class="declinio-tecnico"' : '';
        
        htmlContent += `            <tr${rowClass}>\n`;
        
        row.forEach(cell => {
            const cellStr = (cell || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
            htmlContent += `                <td>${cellStr}</td>\n`;
        });
        
        if (data) {
            htmlContent += `                <td>${(data.parecer || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>\n`;
            htmlContent += `                <td>${(data.observacoes || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>\n`;
            const isDeclinioStatus = data.parecer && data.parecer.toLowerCase().includes('declínio técnico');
            htmlContent += `                <td>${isDeclinioStatus ? 'DECLÍNIO TÉCNICO' : 'OK'}</td>\n`;
        } else {
            htmlContent += `                <td></td>\n<td></td>\n<td>NÃO VALIDADO</td>\n`;
        }
        
        htmlContent += `            </tr>\n`;
    }
    
    htmlContent += `        </tbody>
    </table>
</body>
</html>`;
    
    // Faz download do HTML formatado
    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `beneficiarios_validados_formatado_${new Date().toISOString().split('T')[0]}.xls`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Gera versão HTML colorida do CSV
window.downloadColoredHTML = function() {
    if (!csvData || !sheetData || parecerGroups.length === 0) return;
    
    // Cria um mapa de CPFs com seus pareceres
    const cpfDataMap = new Map();
    parecerGroups.forEach(group => {
        group.items.forEach(item => {
            cpfDataMap.set(normalizeCPF(item.cpf), {
                parecer: item.parecer,
                observacoes: item.observacoes
            });
        });
    });
    
    const headerRow = csvData.headerRow;
    const rows = csvData.rows;
    
    let htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beneficiários Validados</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 10px; font-size: 11px; }
        h1 { font-size: 14px; margin-bottom: 8px; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; }
        th { background-color: #AEC6CF; color: #333; padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 10px; white-space: nowrap; }
        td { padding: 3px 6px; border: 1px solid #ddd; font-size: 10px; }
        tr.declinio-tecnico { background-color: #ffcccc !important; }
        tr.declinio-tecnico td { color: #000 !important; font-weight: 500; }
        tr:hover { background-color: #f5f5f5; }
        tr.declinio-tecnico:hover { background-color: #ffaaaa !important; }
        .container { overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Beneficiários Validados - ${new Date().toLocaleDateString('pt-BR')}</h1>
    <div class="container">
    <table>
        <thead>
            <tr>
`;
    
    // Cabeçalho
    headerRow.forEach(header => {
        htmlContent += `                <th>${(header || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>\n`;
    });
    htmlContent += `                <th>Parecer Técnico</th>\n`;
    htmlContent += `                <th>Observações</th>\n`;
    htmlContent += `            </tr>
        </thead>
        <tbody>
`;
    
    // Linhas
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cpf = row[csvData.cpfColumnIndex];
        const normalizedCpf = normalizeCPF(cpf);
        const data = cpfDataMap.get(normalizedCpf);
        
        const isDeclinio = data && data.parecer && data.parecer.toLowerCase().includes('declínio técnico');
        const rowClass = isDeclinio ? ' class="declinio-tecnico"' : '';
        
        htmlContent += `            <tr${rowClass}>\n`;
        
        row.forEach(cell => {
            const escaped = (cell || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
            htmlContent += `                <td>${escaped}</td>\n`;
        });
        
        htmlContent += `                <td>${data ? (data.parecer || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</td>\n`;
        htmlContent += `                <td>${data ? (data.observacoes || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</td>\n`;
        htmlContent += `            </tr>\n`;
    }
    
    htmlContent += `        </tbody>
    </table>
    </div>
</body>
</html>`;
    
    // Faz download do HTML
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `beneficiarios_validados_colorido_${new Date().toISOString().split('T')[0]}.html`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Detecta o separador do CSV (vírgula ou ponto e vírgula)
function detectCSVSeparator(text) {
    // Conta vírgulas e ponto e vírgulas na primeira linha (ignorando dentro de aspas)
    const firstLine = text.split(/\r?\n/)[0];
    let commaCount = 0;
    let semicolonCount = 0;
    let inQuotes = false;
    
    for (let i = 0; i < firstLine.length; i++) {
        const char = firstLine[i];
        if (char === '"') {
            // Verifica se é aspas escapadas
            if (inQuotes && firstLine[i + 1] === '"') {
                i++; // Pula a próxima aspas
                continue;
            }
            inQuotes = !inQuotes;
        } else if (!inQuotes) {
            // Só conta se não estiver dentro de aspas
            if (char === ',') commaCount++;
            if (char === ';') semicolonCount++;
        }
    }
    
    // Se houver mais ponto e vírgulas, usa ponto e vírgula
    // Caso contrário, usa vírgula
    return semicolonCount > commaCount ? ';' : ',';
}

// Parse CSV melhorado (suporta vírgulas e ponto e vírgula, aspas, quebras de linha, etc.)
function parseCSV(text) {
    const rows = [];
    const lines = text.split(/\r?\n/);
    
    // Detecta o separador automaticamente
    const separator = detectCSVSeparator(text);
    
    for (let line of lines) {
        // Não remove espaços no início/fim ainda, pois pode ser importante para parsing
        if (!line || line.trim().length === 0) continue;
        
        const row = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Aspas duplas escapadas
                    current += '"';
                    i++; // Pula o próximo caractere
                } else {
                    // Toggle de aspas
                    inQuotes = !inQuotes;
                }
            } else if (char === separator && !inQuotes) {
                // Separador fora de aspas = separador de coluna
                // Remove espaços e caracteres invisíveis, mas preserva o conteúdo
                let cleaned = current
                    .replace(/^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g, '') // Remove espaços e caracteres invisíveis apenas no início/fim
                    .replace(/^"|"$/g, ''); // Remove aspas externas se houver
                row.push(cleaned);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Adiciona o último campo
        let cleaned = current
            .replace(/^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g, '')
            .replace(/^"|"$/g, '');
        row.push(cleaned);
        
        // Só adiciona a linha se tiver pelo menos uma coluna não vazia
        if (row.some(cell => cell.trim().length > 0)) {
            rows.push(row);
        }
    }
    
    return rows;
}
