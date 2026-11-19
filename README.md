# ftth (dukon)

Sistema web para mapeamento e documentação de redes **FTTH** sobre o **OpenStreetMap**.
Mostra OLTs, CTOs, CEOs, postes, torres, clientes e cabos e ainda vai ler kml pai

## tecnologias

- **Vue 3 + Vite**
- **Leaflet + OpenStreetMap** (pq sou pobre)
- **Bootstrap Icons** (alguns icons)

## recursos

- **Busca**: barra no topo encontra equipamentos, CTOs, clientes, cabos e outros itens por nome, endereço ou observação. Use ↑/↓ para escolher um resultado, Enter para abrir e Esc para fechar.
- **Edição no mapa**: adicione equipamentos, trace cabos, meça distâncias e edite o traçado.
- **Backup**: exporte/importe JSON e exporte a rede em GeoJSON. Na importação, os comprimentos dos cabos são recalculados.

## versaao

- **v0.1** - estrutura do projeto + mapa base
- **v0.2** - marcadores com ícones, status e camadas
- **v0.3** - cabos com cor/espessura e painel de detalhes
- **v0.4** - busca e régua de medição
- **v0.5** - edição com painel lateral e API mock
- **v1.0** - versão "final" (drop, trecho, satélite, white-label)
- **v1.1** - exportação/importação de dados em JSON
- **v1.2** - barra de busca reutilizável, navegação por teclado nos resultados e importação normalizada
