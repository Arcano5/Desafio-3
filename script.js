/**
 * Sistema de Mapeamento de Unidades de Saúde
 * Versão 2.0 - Fluxo Guiado pelo Usuário
 */

// ==================== CONFIGURAÇÕES ====================
const CONFIG = {
    WEBHOOK_MENU: 'https://angryventures.app.n8n.cloud/webhook/obter-opcoes',
    WEBHOOK_UNIDADES: 'https://angryventures.app.n8n.cloud/webhook/unidades',
    DEFAULT_ZOOM: 12,
    BRAZIL_CENTER: [-14.2350, -51.9253],
    BRAZIL_ZOOM: 4,
    CACHE_DURATION: 3600000, // 1 hora em ms
    DEBOUNCE_DELAY: 300
};

// ==================== ESTADO GLOBAL ====================
let map = null;
let markers = [];
let currentCards = [];
let currentData = [];
let currentCity = '';
let currentState = '';
let activeCardIndex = null;
let citiesData = null;
let requestCache = new Map();

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initMap();
        setupEventListeners();
        setupTriggerButton();
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showError('Erro ao inicializar aplicação. Recarregue a página.');
    }
});

// ==================== SETUP DO BOTÃO DE GATILHO ====================
function setupTriggerButton() {
    const btnIniciar = document.getElementById('btn-iniciar');
    const contextMessage = document.getElementById('context-message');
    const filtersContainer = document.getElementById('filters-container');
    const btnContainer = document.querySelector('.trigger-container');
    
    btnIniciar.addEventListener('click', async () => {
        // Muda o texto do botão para indicar carregamento
        const originalText = btnIniciar.innerHTML;
        btnIniciar.innerHTML = '<span class="btn-icon">⏳</span> Consultando base de dados...';
        btnIniciar.disabled = true;
        
        try {
            // Carrega os municípios
            await loadMunicipiosData();
            
            // Se chegou aqui, deu certo - esconde o texto e botão, mostra os filtros
            if (citiesData && citiesData.length > 0) {
                // Animação de fade out
                if (contextMessage) {
                    contextMessage.style.transition = 'opacity 0.3s';
                    contextMessage.style.opacity = '0';
                }
                btnContainer.style.transition = 'opacity 0.3s';
                btnContainer.style.opacity = '0';
                
                setTimeout(() => {
                    if (contextMessage) contextMessage.style.display = 'none';
                    btnContainer.style.display = 'none';
                    filtersContainer.style.display = 'block';
                    filtersContainer.style.opacity = '0';
                    filtersContainer.style.transition = 'opacity 0.3s';
                    
                    setTimeout(() => {
                        filtersContainer.style.opacity = '1';
                    }, 10);
                }, 300);
                
                showSuccess('Dados carregados com sucesso! Selecione um estado para começar.');
            } else {
                throw new Error('Nenhum dado recebido da base');
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            showError('Erro ao carregar base de dados. Tente novamente mais tarde.');
            
            // Restaura o botão
            btnIniciar.innerHTML = originalText;
            btnIniciar.disabled = false;
        }
    });
}

// ==================== MAPA ====================
async function initMap() {
    map = L.map('map').setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB',
        subdomains: 'abcd',
        maxZoom: 19,
        minZoom: 3
    }).addTo(map);
}

// ==================== CARREGAMENTO DE DADOS LOCAIS ====================
async function loadMunicipiosData() {
    try {
        const response = await fetch(CONFIG.WEBHOOK_MENU, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Erro ao carregar municípios dinâmicos');
        
        citiesData = await response.json();
        populateEstados();
        return true;
    } catch (error) {
        console.error('Erro:', error);
        throw new Error('Não foi possível carregar a lista de municípios ativos');
    }
}

function populateEstados() {
    const estadoSelect = document.getElementById('estado');
    estadoSelect.innerHTML = '<option value="">Selecione um estado</option>';
    
    const estados = [...new Set(citiesData.map(item => item.estado))].sort();
    
    estados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado;
        option.textContent = estado;
        estadoSelect.appendChild(option);
    });
}

function populateCidades(estado) {
    const cidadeSelect = document.getElementById('cidade');
    const cidades = citiesData
        .filter(item => item.estado === estado)
        .map(item => item.cidade)
        .sort();
    
    cidadeSelect.innerHTML = '<option value="">Selecione uma cidade</option>';
    
    cidades.forEach(cidade => {
        const option = document.createElement('option');
        option.value = cidade;
        option.textContent = cidade;
        cidadeSelect.appendChild(option);
    });
    
    cidadeSelect.disabled = false;
}

// ==================== WEBHOOK ====================
async function fetchHealthUnits(estado, cidade) {
    const cacheKey = `${estado}|${cidade}`;
    const cached = requestCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_DURATION) {
        console.log('Usando dados em cache');
        return cached.data;
    }
    
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error-message');
    
    loadingElement.style.display = 'block';
    errorElement.style.display = 'none';
    
    try {
        const response = await fetch(CONFIG.WEBHOOK_UNIDADES, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                estado_solicitado: estado,
                cidade_solicitada: cidade
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        
        if (!data || !Array.isArray(data)) {
            throw new Error('Formato de dados inválido');
        }
        
        requestCache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });
        
        return data;
    } catch (error) {
        console.error('Erro no fetch:', error);
        showError(`Erro ao carregar unidades: ${error.message}`);
        return [];
    } finally {
        loadingElement.style.display = 'none';
    }
}

// ==================== RENDERIZAÇÃO (OTIMIZADA) ====================
function clearMapMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function addMarkersToMap(units) {
    const bounds = [];
    
    units.forEach((unit, index) => {
        if (!unit.latitude || !unit.longitude) {
            console.warn('Unidade sem coordenadas:', unit);
            return;
        }
        
        const lat = parseFloat(unit.latitude);
        const lng = parseFloat(unit.longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
            console.warn('Coordenadas inválidas:', unit);
            return;
        }
        
        const marker = L.marker([lat, lng]).addTo(map);
        
        const popupContent = createPopupContent(unit);
        marker.bindPopup(popupContent, { className: 'custom-popup' });
        
        marker.on('click', () => {
            scrollToCard(index);
            highlightCard(index);
            marker.openPopup();
        });
        
        markers.push(marker);
        bounds.push([lat, lng]);
    });
    
    if (bounds.length > 0) {
        const boundsObj = L.latLngBounds(bounds);
        map.fitBounds(boundsObj, { padding: [50, 50] });
    }
}

function createPopupContent(unit) {
    return `
        <div class="custom-popup">
            <div class="popup-title">${escapeHtml(unit.nome || 'Unidade de Saúde')}</div>
            <div class="popup-info">📞 ${escapeHtml(unit.telefone || 'Não informado')}</div>
            <div class="popup-info">🕒 ${escapeHtml(unit.horario || 'Não informado')}</div>
            <div class="popup-info">📍 ${escapeHtml(unit.endereco || 'Não informado')}</div>
            <a href="https://www.google.com/maps/search/?api=1&query=${unit.latitude},${unit.longitude}" 
               target="_blank" 
               class="popup-directions">
                🚗 Como Chegar
            </a>
        </div>
    `;
}

function renderCards(units) {
    const container = document.getElementById('cards-container');
    const fragment = document.createDocumentFragment();
    
    if (!units || units.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🏥</span>
                <p>Nenhuma unidade de saúde encontrada<br>nesta cidade</p>
            </div>
        `;
        return;
    }
    
    units.forEach((unit, index) => {
        const card = createCardElement(unit, index);
        fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
    currentCards = document.querySelectorAll('.health-card');
}

function createCardElement(unit, index) {
    const div = document.createElement('div');
    div.className = 'health-card';
    div.setAttribute('data-index', index);
    
    div.innerHTML = `
        <div class="card-header">
            <h3>${escapeHtml(unit.nome || 'Unidade de Saúde')}</h3>
            <span class="card-badge">🏥 UBS</span>
        </div>
        <div class="card-info">
            <div class="info-row">
                <span class="emoji">📞</span>
                <span>${escapeHtml(unit.telefone || 'Telefone não informado')}</span>
            </div>
            <div class="info-row">
                <span class="emoji">🕒</span>
                <span>${escapeHtml(unit.horario || 'Horário não informado')}</span>
            </div>
            <div class="info-row">
                <span class="emoji">📍</span>
                <span>${escapeHtml(unit.endereco || 'Endereço não informado')}</span>
            </div>
        </div>
        <div class="card-actions">
            <a href="https://www.google.com/maps/search/?api=1&query=${unit.latitude},${unit.longitude}" 
               target="_blank" 
               class="directions-link"
               onclick="event.stopPropagation()">
                🚗 Como Chegar
            </a>
        </div>
    `;
    
    div.addEventListener('click', (e) => {
        if (e.target.closest('.directions-link')) return;
        focusOnMarker(index);
    });
    
    return div;
}

function focusOnMarker(index) {
    if (!markers[index]) return;
    
    const marker = markers[index];
    const latlng = marker.getLatLng();
    
    map.setView(latlng, CONFIG.DEFAULT_ZOOM);
    marker.openPopup();
    highlightCard(index);
    scrollToCard(index);
}

function highlightCard(index) {
    currentCards.forEach(card => card.classList.remove('active'));
    if (currentCards[index]) {
        currentCards[index].classList.add('active');
        activeCardIndex = index;
    }
}

function scrollToCard(index) {
    const card = currentCards[index];
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ==================== EVENTOS ====================
function setupEventListeners() {
    const estadoSelect = document.getElementById('estado');
    const cidadeSelect = document.getElementById('cidade');
    
    estadoSelect.addEventListener('change', (e) => {
        const estado = e.target.value;
        if (!estado) {
            cidadeSelect.disabled = true;
            cidadeSelect.innerHTML = '<option value="">Primeiro selecione um estado</option>';
            clearUI();
            return;
        }
        
        currentState = estado;
        populateCidades(estado);
        clearUI();
    });
    
    cidadeSelect.addEventListener('change', debounce(async (e) => {
        const cidade = e.target.value;
        if (!cidade) {
            clearUI();
            return;
        }
        
        currentCity = cidade;
        await loadAndDisplayData(currentState, currentCity);
    }, CONFIG.DEBOUNCE_DELAY));
}

async function loadAndDisplayData(estado, cidade) {
    try {
        const units = await fetchHealthUnits(estado, cidade);
        currentData = units;
        
        clearMapMarkers();
        renderCards(units);
        
        if (units && units.length > 0) {
            addMarkersToMap(units);
        } else {
            showError('Nenhuma unidade encontrada para esta cidade');
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showError('Erro ao carregar unidades de saúde');
    }
}

function clearUI() {
    currentData = [];
    clearMapMarkers();
    document.getElementById('cards-container').innerHTML = `
        <div class="empty-state">
            <span class="empty-icon">📍</span>
            <p>Selecione uma cidade<br>para visualizar as unidades de saúde</p>
        </div>
    `;
    document.getElementById('error-message').style.display = 'none';
    
    if (map && CONFIG.BRAZIL_CENTER) {
        map.setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
    }
}

// ==================== UTILITÁRIOS ====================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.style.backgroundColor = '#d4edda';
    errorElement.style.borderColor = '#c3e6cb';
    errorElement.style.color = '#155724';
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
        errorElement.style.display = 'none';
        errorElement.style.backgroundColor = '';
        errorElement.style.borderColor = '';
        errorElement.style.color = '';
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== EXPORT (para debug) ====================
if (typeof window !== 'undefined') {
    window.debugMap = {
        clearCache: () => requestCache.clear(),
        getCacheSize: () => requestCache.size,
        getMarkers: () => markers.length
    };
}