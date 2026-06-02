# Mapa da Saúde - Sistema de Mapeamento de Unidades de Saúde

## 📋 Descrição
Sistema web para mapeamento de unidades de saúde, utilizando Leaflet e OpenStreetMap, com integração via webhook n8n.

## 🚀 Funcionalidades
- Filtro em cascata (Estado → Cidade)
- Mapa interativo com pins
- Cards informativos com sincronização bidirecional
- Link "Como Chegar" integrado ao Google Maps
- Carregamento sob demanda com cache local
- Design responsivo

## 🛠️ Tecnologias
- HTML5
- CSS3 (Flexbox/Grid)
- JavaScript Vanilla ES6+
- Leaflet.js
- OpenStreetMap

## 📦 Estrutura do Projeto

## 🔧 Instalação
1. Clone o repositório
2. Configure o webhook no arquivo `script.js`:
   ```javascript
   const CONFIG = {
       WEBHOOK_URL: 'https://seu-webhook-n8n.com/endpoint'
   };