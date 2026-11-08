# OpenStreetMap - Mapa FTTH (Dukon)

Sistema web para mapeamento e documentação de redes **FTTH** sobre o **OpenStreetMap**.
Mostra OLTs, CTOs, CEOs, postes, torres, clientes e cabos em um mapa interativo, com
edição, busca, medição de distância e controle de portas livres das CTOs.

## Stack

- **Vue 3 + Vite**
- **Leaflet + OpenStreetMap** (mapa de ruas e satélite Esri)
- **Bootstrap Icons**

## Funcionalidades

- Marcadores por tipo com status (ativo, planejado, em manutenção, inativo)
- Contagem de **portas livres** por CTO (badge no marcador)
- Camadas ligáveis/desligáveis na barra lateral
- Cabos com **cor, espessura e comprimento** calculado automaticamente
- **Busca** por nome, endereço, observação e outros campos
- **Régua** para medir distâncias no mapa
- Painel para **criar, editar e excluir** elementos e arrastar marcadores
- Cliente vinculado a uma CTO + criação do cabo **drop**
- **Rota do drop** (trecho) editável ponto a ponto
- **White-label** (nome da empresa, cor principal e logo)
- Dados persistidos no `localStorage` (API mock, sem precisar de backend)

## Rodar o projeto

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Build de produção

```bash
npm run build
npm run preview
```

## Estrutura

```
src/
  api.js                  API mock (localStorage) com CRUD e busca
  data.js                 dados de exemplo da rede FTTH
  icons.js                ícones dos elementos
  state.js                estado global + formatação de distância
  components/CableStyle.vue   seletor de cor/espessura do cabo
  views/MapView.vue       mapa principal
  views/Settings.vue      tela de configurações
```

## Versões

- **v0.1** - estrutura do projeto + mapa base
- **v0.2** - marcadores com ícones, status e camadas
- **v0.3** - cabos com cor/espessura e painel de detalhes
- **v0.4** - busca e régua de medição
- **v0.5** - edição com painel lateral e API mock
- **v1.0** - versão final (drop, trecho, satélite, white-label)
