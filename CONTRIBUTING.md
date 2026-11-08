# Como contribuir

Valeu pelo interesse em melhorar o mapa FTTH! Siga os passos abaixo.

## Preparando o ambiente

```bash
npm install
npm run dev
```

O projeto abre em `http://localhost:5173`.

## Fluxo de trabalho

1. Atualize o `main`: `git checkout main && git pull`
2. Crie uma branch com um nome descritivo:
   - `feat/nome-da-feature`
   - `fix/nome-do-bug`
   - `docs/o-que-mudou`
3. Faça commits pequenos e claros.
4. Rode o build antes de abrir o PR: `npm run build`
5. Abra o Pull Request explicando **o que** mudou e **como testar**.

## Padrão de commits

Usamos mensagens curtas no estilo:

- `feat: adiciona exportacao para GeoJSON`
- `fix: corrige calculo de portas livres da CTO`
- `docs: atualiza README`
- `ci: ajusta workflow de build`

## Dicas

- Não commite `node_modules/` nem `dist/`.
- Prefira PRs pequenos e focados.
- Descreva o problema e a solução no PR.
