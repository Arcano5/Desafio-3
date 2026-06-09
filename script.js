/**
 * Sistema de Mapeamento de Unidades de Saúde
 * Versão 2.4 - Com OpenStreetMap e validação de coordenadas
 */

// ==================== CONFIGURAÇÕES ====================
const CONFIG = {
    WEBHOOK_MENU: 'https://angryventures.app.n8n.cloud/webhook/obter-opcoes',
    WEBHOOK_UNIDADES: 'https://angryventures.app.n8n.cloud/webhook/unidades',
    DEFAULT_ZOOM: 15,
    BRAZIL_CENTER: [-14.2350, -51.9253],
    BRAZIL_ZOOM: 4,
    CACHE_DURATION: 3600000,
    DEBOUNCE_DELAY: 300,
    MAX_MARKERS: 1000,
    MAX_CACHE_SIZE: 50,
    // 🔧 CORREÇÃO: Limites geográficos do Brasil para validar coordenadas
    BRAZIL_LAT_MIN: -33.5,
    BRAZIL_LAT_MAX: 5.5,
    BRAZIL_LNG_MIN: -73.5,
    BRAZIL_LNG_MAX: -34.5
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
let isLoading = false;
let mapInitialized = false;

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initMap();
        setupEventListeners();
        setupTriggerButton();
        
        // Garante que o mapa mostre o Brasil corretamente
        setTimeout(() => {
            if (map) {
                map.setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
                console.log('Mapa centralizado no Brasil');
            }
        }, 100);
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showError('Erro ao inicializar aplicação. Recarregue a página.');
    }
});

// ==================== SETUP DO BOTÃO DE GATILHO ====================
function setupTriggerButton() {
    const btnIniciar = document.getElementById('btn-iniciar');
    const contextMessage = document.getElementById('context-message');
    const filterContainer = document.getElementById('filter-container');
    const btnContainer = document.querySelector('.trigger-container');
    
    if (!btnIniciar) {
        console.error('Botão btn-iniciar não encontrado');
        return;
    }
    
    btnIniciar.addEventListener('click', async () => {
        if (btnIniciar.disabled) return;
        
        const originalText = btnIniciar.innerHTML;
        btnIniciar.innerHTML = '<span class="btn-icon">⏳</span> Consultando base de dados...';
        btnIniciar.disabled = true;
        
        try {
            await loadMunicipiosData();
            
            if (citiesData && citiesData.length > 0) {
                if (contextMessage) {
                    contextMessage.style.transition = 'opacity 0.3s';
                    contextMessage.style.opacity = '0';
                }
                if (btnContainer) {
                    btnContainer.style.transition = 'opacity 0.3s';
                    btnContainer.style.opacity = '0';
                }
                
                setTimeout(() => {
                    if (contextMessage) contextMessage.style.display = 'none';
                    if (btnContainer) btnContainer.style.display = 'none';
                    if (filterContainer) {
                        filterContainer.style.display = 'block';
                        filterContainer.style.opacity = '0';
                        filterContainer.style.transition = 'opacity 0.3s';
                        
                        setTimeout(() => {
                            filterContainer.style.opacity = '1';
                        }, 10);
                    }
                }, 300);
                
                showSuccess('Dados carregados com sucesso! Selecione um estado para começar.');
            } else {
                throw new Error('Nenhum dado recebido da base');
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            showError('Erro ao carregar base de dados. Tente novamente mais tarde.');
            btnIniciar.innerHTML = originalText;
            btnIniciar.disabled = false;
        }
    });
}

// ==================== MAPA ====================
async function initMap() {
    if (mapInitialized && map) {
        console.log('Mapa já inicializado');
        return;
    }
    
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Elemento do mapa não encontrado');
        return;
    }
    
    try {
        map = L.map('map').setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
        
        // 🔧 SUBSTITUÍDO: OpenStreetMap (sem CORS, mais confiável)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            minZoom: 3
        }).addTo(map);
        
        mapInitialized = true;
        console.log('Mapa inicializado com OpenStreetMap - Brasil centralizado');
    } catch (error) {
        console.error('Erro ao inicializar mapa:', error);
        throw error;
    }
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
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        
        if (!data || typeof data !== 'object') {
            throw new Error('Formato de dados inválido');
        }
        
        citiesData = Array.isArray(data) ? data : (data.data ? (Array.isArray(data.data) ? data.data : []) : []);
        
        if (!Array.isArray(citiesData) || citiesData.length === 0) {
            throw new Error('Nenhum município encontrado');
        }
        
        populateEstados();
        return true;
    } catch (error) {
        console.error('Erro detalhado:', error);
        throw new Error(`Não foi possível carregar a lista de municípios ativos: ${error.message}`);
    }
}

function populateEstados() {
    const estadoSelect = document.getElementById('estado');
    if (!estadoSelect) return;
    
    estadoSelect.innerHTML = '<option value="">Selecione um estado</option>';
    
    const estados = [...new Set(citiesData.map(item => {
        return item.nome?.estado || item.estado || item.state || '';
    }))].filter(estado => estado && estado.trim() !== '').sort();
    
    estados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado;
        option.textContent = estado;
        estadoSelect.appendChild(option);
    });
}

function populateCidades(estado) {
    const cidadeSelect = document.getElementById('cidade');
    if (!cidadeSelect) return;
    
    const cidades = citiesData
        .filter(item => {
            const itemEstado = item.nome?.estado || item.estado || item.state || '';
            return itemEstado === estado;
        })
        .map(item => item.nome?.cidade || item.cidade || item.city || '')
        .filter(cidade => cidade && cidade.trim() !== '')
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
    if (isLoading) {
        console.log('Requisição em andamento, aguarde...');
        return [];
    }
    
    const cacheKey = `${estado}|${cidade}`;
    const cached = requestCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_DURATION) {
        console.log('Usando dados em cache');
        return cached.data;
    }
    
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error-message');
    
    if (loadingElement) loadingElement.style.display = 'block';
    if (errorElement) errorElement.style.display = 'none';
    
    isLoading = true;
    
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
        
        let units = [];
        if (Array.isArray(data)) {
            units = data;
        } else if (data.data && Array.isArray(data.data)) {
            units = data.data;
        } else if (data.unidades && Array.isArray(data.unidades)) {
            units = data.unidades;
        } else {
            console.warn('Formato de dados inesperado:', data);
            units = [];
        }
        
        // 🔧 CORREÇÃO: Valida e corrige coordenadas inválidas
        units = units.filter(unit => {
            let lat = parseFloat(unit.latitude || unit.lat || unit.Latitude || unit.LAT);
            let lng = parseFloat(unit.longitude || unit.lng || unit.Longitude || unit.LON || unit.LNG);
            
            // Verifica se a coordenada está dentro do Brasil
            const isValid = !isNaN(lat) && !isNaN(lng) &&
                           lat >= CONFIG.BRAZIL_LAT_MIN && lat <= CONFIG.BRAZIL_LAT_MAX &&
                           lng >= CONFIG.BRAZIL_LNG_MIN && lng <= CONFIG.BRAZIL_LNG_MAX;
            
            if (!isValid) {
                console.warn(`Coordenada inválida para ${unit.nome || 'unidade'}: lat=${lat}, lng=${lng}`);
            }
            
            return isValid;
        });
        
        if (requestCache.size >= CONFIG.MAX_CACHE_SIZE) {
            const firstKey = requestCache.keys().next().value;
            requestCache.delete(firstKey);
        }
        
        requestCache.set(cacheKey, {
            data: units,
            timestamp: Date.now()
        });
        
        console.log(`Carregadas ${units.length} unidades válidas para ${cidade}/${estado}`);
        return units;
    } catch (error) {
        console.error('Erro no fetch:', error);
        showError(`Erro ao carregar unidades: ${error.message}`);
        return [];
    } finally {
        isLoading = false;
        if (loadingElement) loadingElement.style.display = 'none';
    }
}

// ==================== RENDERIZAÇÃO (OTIMIZADA) ====================
function clearMapMarkers() {
    if (!map) return;
    
    markers.forEach(marker => {
        try {
            if (marker && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        } catch (error) {
            console.warn('Erro ao remover marcador:', error);
        }
    });
    markers = [];
    
    if (window.gc) window.gc();
}

// 🔧 ÍCONE CUSTOMIZADO COLORIDO
function createCustomIcon(isActive = false) {
    return L.divIcon({
        className: `custom-marker ${isActive ? 'custom-marker-active' : ''}`,
        html: `<div style="
            background: ${isActive ? '#e74c3c' : '#667eea'};
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            transition: all 0.2s;
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    });
}

function addMarkersToMap(units) {
    if (!map) {
        console.error('Mapa não inicializado');
        return;
    }
    
    if (!units || units.length === 0) {
        console.warn('Nenhuma unidade com coordenadas válidas para adicionar ao mapa');
        showError('Nenhuma coordenada válida encontrada para exibir no mapa');
        return;
    }
    
    const unitsToProcess = units.slice(0, CONFIG.MAX_MARKERS);
    const bounds = [];
    
    console.log(`Adicionando ${unitsToProcess.length} marcadores ao mapa`);
    
    unitsToProcess.forEach((unit, index) => {
        let lat, lng;
        
        try {
            lat = parseFloat(unit.latitude || unit.lat || unit.Latitude || unit.LAT);
            lng = parseFloat(unit.longitude || unit.lng || unit.Longitude || unit.LON || unit.LNG);
        } catch (error) {
            console.warn('Erro ao parsear coordenadas:', error);
            return;
        }
        
        // Validação extra antes de adicionar
        if (isNaN(lat) || isNaN(lng) ||
            lat < CONFIG.BRAZIL_LAT_MIN || lat > CONFIG.BRAZIL_LAT_MAX ||
            lng < CONFIG.BRAZIL_LNG_MIN || lng > CONFIG.BRAZIL_LNG_MAX) {
            console.warn(`Coordenada fora do Brasil para: ${unit.nome || 'unidade'}`, lat, lng);
            return;
        }
        
        try {
            const marker = L.marker([lat, lng], {
                icon: createCustomIcon(false)
            }).addTo(map);
            
            const popupContent = createPopupContent(unit);
            marker.bindPopup(popupContent, { className: 'custom-popup' });
            
            const markerIndex = markers.length;
            
            marker.on('click', () => {
                console.log(`Marcador ${markerIndex} clicado`);
                highlightCard(markerIndex);
                scrollToCard(markerIndex);
                marker.openPopup();
                
                marker.setIcon(createCustomIcon(true));
                
                markers.forEach((m, i) => {
                    if (i !== markerIndex && m.setIcon) {
                        m.setIcon(createCustomIcon(false));
                    }
                });
            });
            
            markers.push(marker);
            bounds.push([lat, lng]);
        } catch (error) {
            console.error('Erro ao adicionar marcador:', error);
        }
    });
    
    if (bounds.length > 0) {
        try {
            const boundsObj = L.latLngBounds(bounds);
            map.fitBounds(boundsObj, { padding: [50, 50] });
            console.log(`Mapa ajustado para ${bounds.length} pontos`);
        } catch (error) {
            console.warn('Erro ao ajustar bounds do mapa:', error);
            map.setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
        }
    } else {
        console.warn('Nenhum bound válido para ajustar o mapa');
    }
}

function createPopupContent(unit) {
    const nome = unit.nome || unit.name || unit.NOME || 'Unidade de Saúde';
    const telefone = unit.telefone || unit.phone || unit.TELEFONE || 'Não informado';
    const horario = unit.horario || unit.hours || unit.HORARIO || 'Não informado';
    const endereco = unit.endereco || unit.address || unit.ENDERECO || 'Não informado';
    const lat = unit.latitude || unit.lat || '';
    const lng = unit.longitude || unit.lng || '';
    
    return `
        <div class="custom-popup">
            <div class="popup-title">🏥 ${escapeHtml(nome)}</div>
            <div class="popup-info">📞 ${escapeHtml(telefone)}</div>
            <div class="popup-info">🕒 ${escapeHtml(horario)}</div>
            <div class="popup-info">📍 ${escapeHtml(endereco)}</div>
            <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" 
               target="_blank" 
               class="popup-directions">
                🚗 Como Chegar
            </a>
        </div>
    `;
}

function renderCards(units) {
    const container = document.getElementById('cards-container');
    if (!container) return;
    
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    
    const fragment = document.createDocumentFragment();
    
    if (!units || units.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = `
            <span class="empty-icon">🏥</span>
            <p>Nenhuma unidade de saúde com coordenadas válidas<br>encontrada nesta cidade</p>
            <small style="display: block; margin-top: 8px;">⚠️ Verifique se os dados do webhook contêm latitude/longitude corretas</small>
        `;
        fragment.appendChild(emptyDiv);
    } else {
        units.forEach((unit, index) => {
            const card = createCardElement(unit, index);
            fragment.appendChild(card);
        });
    }
    
    container.appendChild(fragment);
    currentCards = document.querySelectorAll('.health-card');
    console.log(`${currentCards.length} cards renderizados`);
}

function createCardElement(unit, index) {
    const div = document.createElement('div');
    div.className = 'health-card';
    div.setAttribute('data-index', index);
    div.setAttribute('data-lat', unit.latitude || unit.lat || '');
    div.setAttribute('data-lng', unit.longitude || unit.lng || '');
    
    const nome = unit.nome || unit.name || unit.NOME || 'Unidade de Saúde';
    const telefone = unit.telefone || unit.phone || unit.TELEFONE || 'Telefone não informado';
    const horario = unit.horario || unit.hours || unit.HORARIO || 'Horário não informado';
    const endereco = unit.endereco || unit.address || unit.ENDERECO || 'Endereço não informado';
    const latitude = unit.latitude || unit.lat || 0;
    const longitude = unit.longitude || unit.lng || 0;
    
    div.innerHTML = `
        <div class="card-header">
            <h3>${escapeHtml(nome)}</h3>
            <span class="card-badge">🏥 UBS</span>
        </div>
        <div class="card-info">
            <div class="info-row">
                <span class="emoji">📞</span>
                <span>${escapeHtml(telefone)}</span>
            </div>
            <div class="info-row">
                <span class="emoji">🕒</span>
                <span>${escapeHtml(horario)}</span>
            </div>
            <div class="info-row">
                <span class="emoji">📍</span>
                <span>${escapeHtml(endereco)}</span>
            </div>
        </div>
        <div class="card-actions">
            <a href="https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}" 
               target="_blank" 
               class="directions-link"
               onclick="event.stopPropagation()">
                🚗 Como Chegar
            </a>
        </div>
    `;
    
    const clickHandler = (e) => {
        if (e.target.closest('.directions-link')) return;
        
        console.log(`Card ${index} clicado: ${nome}`);
        
        div.style.transform = 'scale(0.98)';
        setTimeout(() => {
            div.style.transform = '';
        }, 150);
        
        focusOnMarker(index);
    };
    
    div.addEventListener('click', clickHandler);
    div.clickHandler = clickHandler;
    
    return div;
}

function focusOnMarker(index) {
    if (!markers[index]) {
        console.error(`Marcador ${index} não encontrado`);
        
        const card = currentCards[index];
        if (card) {
            const lat = card.getAttribute('data-lat');
            const lng = card.getAttribute('data-lng');
            if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                console.log(`Tentando focar por coordenadas: ${lat}, ${lng}`);
                map.setView([parseFloat(lat), parseFloat(lng)], CONFIG.DEFAULT_ZOOM);
            }
        }
        return;
    }
    
    try {
        const marker = markers[index];
        const latlng = marker.getLatLng();
        
        console.log(`Focando no marcador ${index}: ${latlng.lat}, ${latlng.lng}`);
        
        map.setView(latlng, CONFIG.DEFAULT_ZOOM, {
            animate: true,
            duration: 0.5
        });
        
        marker.openPopup();
        
        markers.forEach((m, i) => {
            if (m.setIcon) {
                m.setIcon(createCustomIcon(i === index));
            }
        });
        
        highlightCard(index);
        scrollToCard(index);
        
    } catch (error) {
        console.error('Erro ao focar no marcador:', error);
    }
}

function highlightCard(index) {
    currentCards.forEach(card => card.classList.remove('active'));
    if (currentCards[index]) {
        currentCards[index].classList.add('active');
        activeCardIndex = index;
        console.log(`Card ${index} destacado`);
    }
}

function scrollToCard(index) {
    const card = currentCards[index];
    if (card) {
        card.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center'
        });
    }
}

// ==================== EVENTOS ====================
function setupEventListeners() {
    const estadoSelect = document.getElementById('estado');
    const cidadeSelect = document.getElementById('cidade');
    
    if (estadoSelect) {
        estadoSelect.addEventListener('change', (e) => {
            const estado = e.target.value;
            if (!estado) {
                if (cidadeSelect) {
                    cidadeSelect.disabled = true;
                    cidadeSelect.innerHTML = '<option value="">Primeiro selecione um estado</option>';
                }
                clearUI();
                return;
            }
            
            currentState = estado;
            populateCidades(estado);
            clearUI();
        });
    }
    
    if (cidadeSelect) {
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
}

async function loadAndDisplayData(estado, cidade) {
    if (!estado || !cidade) {
        console.warn('Estado ou cidade não informados');
        return;
    }
    
    try {
        console.log(`Carregando dados para: ${cidade}/${estado}`);
        const units = await fetchHealthUnits(estado, cidade);
        currentData = units;
        
        clearMapMarkers();
        renderCards(units);
        
        if (units && units.length > 0) {
            setTimeout(() => {
                addMarkersToMap(units);
            }, 50);
        } else {
            showError('Nenhuma unidade com coordenadas válidas encontrada para esta cidade');
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showError('Erro ao carregar unidades de saúde');
    }
}

function clearUI() {
    currentData = [];
    clearMapMarkers();
    
    const cardsContainer = document.getElementById('cards-container');
    if (cardsContainer) {
        cardsContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📍</span>
                <p>Selecione uma cidade<br>para visualizar as unidades de saúde</p>
            </div>
        `;
    }
    
    const errorElement = document.getElementById('error-message');
    if (errorElement) errorElement.style.display = 'none';
    
    if (map && mapInitialized && CONFIG.BRAZIL_CENTER) {
        map.setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
        console.log('Voltando para visão do Brasil');
    }
}

// ==================== UTILITÁRIOS ====================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    if (!errorElement) return;
    
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
        if (errorElement) errorElement.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    const errorElement = document.getElementById('error-message');
    if (!errorElement) return;
    
    errorElement.style.backgroundColor = '#d4edda';
    errorElement.style.borderColor = '#c3e6cb';
    errorElement.style.color = '#155724';
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
        if (errorElement) {
            errorElement.style.display = 'none';
            errorElement.style.backgroundColor = '';
            errorElement.style.borderColor = '';
            errorElement.style.color = '';
        }
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
        clearCache: () => {
            requestCache.clear();
            console.log('Cache limpo');
        },
        getCacheSize: () => requestCache.size,
        getMarkers: () => markers.length,
        getCards: () => currentCards.length,
        forceGC: () => {
            clearMapMarkers();
            if (window.gc) window.gc();
            console.log('Forçando coleta de lixo');
        },
        focusMarker: (index) => focusOnMarker(index),
        resetView: () => {
            if (map) map.setView(CONFIG.BRAZIL_CENTER, CONFIG.BRAZIL_ZOOM);
        },
        getBounds: () => CONFIG
    };
}