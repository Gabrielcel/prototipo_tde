# Design e experiência do usuário

Paleta original preservada (`frontend/css/base/variables.css`):

| Função | Cor |
|---|---|
| Ação principal / links | `#2F6FAD` |
| Navegação / institucional | `#1F4E79` |
| Secundário / suave / interação | `#4B83BB` / `#EAF3FC` / `#DCEBFA` |
| Positivo / concluído | `#397F6F` (texto sobre fundo claro: `#2C6558`) |
| Erro / destrutivo | `#B3382C` |
| Atenção / pendência | amarelo `#FFF2D1` com texto `#7A4F00` |
| Fundo / texto / texto secundário | `#F4F8FC` / `#26394D` / `#596F84` |

- **Tipografia:** Source Sans 3 (auto-hospedada). Título de página 26–30px; seção 20px; texto 15px; auxiliar 13px;
  indicadores 32px.
- **Espaçamento:** múltiplos de 4px (`--space-1` … `--space-12`). Raios: 6, 8 e 12px. Sombras discretas.
- **Aproveitamento da tela:** contêiner centralizado com largura máxima de 1440px (1560px a partir de 1800px) e margens
  proporcionais (`clamp`), em vez de colado à esquerda.
- **Grids:** `auto-fit/minmax` para cards; layout principal+lateral em duas colunas ≥1200px; pontos de quebra
  intermediários (1200, 900, 720, 600px).
- **Navegação:** barra lateral no desktop; no celular, barra superior + navegação inferior (4 itens + “Mais” para gestor).
- **Estados:** carregando (esqueleto), vazio, erro (com “Tentar novamente”), sem resultado de filtro e sem permissão.
- **Feedback:** notificações com `role` adequado; erros ficam até serem fechados; situação sempre com ícone + texto.
- **Acessibilidade:** link “Ir para o conteúdo”, foco visível, rótulos em todos os campos, erros ligados por
  `aria-describedby`, `<dialog>` nativo (foco preso, Esc fecha), `prefers-reduced-motion`.
- **Logo:** símbolo próprio (adultos e criança sob um arco de proteção) em `frontend/assets/images/logo/`: símbolo,
  versão clara, horizontal (clara e escura) e favicon.
