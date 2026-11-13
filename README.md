# 🌧️ Olho no Risco

> Hackathon APONTI Academy – Desafio **Antena na Lama** · Caminho **1. Prevenir e cuidar (antes da crise)**

**Ideia em uma frase:** qualquer morador do Recife denuncia no mapa, com foto, um problema que agrava alagamentos e deslizamentos (encosta rachada, lixo no canal, bueiro entupido…); uma IA sugere a prioridade, a Defesa Civil confere e a prefeitura age **antes** da chuva.

🔗 **Deploy público:** _preencher o link (Render)_ · **Painel da Defesa Civil:** `/painel.html`

## Problema
Rios, canais e encostas da RMR ficam entupidos ou instáveis, e a prefeitura só descobre depois da tragédia (maio/2022: +120 mortes em PE). A informação sobre quais pontos são mais urgentes não chega a quem pode agir.

## Fluxo principal (ponta a ponta)
1. Morador abre o site no celular e toca em **Denunciar um problema**.
2. Escolhe o tipo (botões grandes com ícone), marca o local (GPS ou toque no mapa) e envia **foto + descrição curta**.
3. **IA (Gemini Flash-Lite, plano gratuito)** analisa foto + texto + categoria e devolve: prioridade (baixa/média/alta), motivo em linguagem simples, orientação de segurança e se a foto é coerente com o relato.
4. O ponto aparece no mapa; outros moradores podem **confirmar ("Também vi isso aqui")**.
5. A **Defesa Civil** (`/painel.html`) vê a fila ordenada por prioridade, **confirma ou corrige a prioridade da IA** e muda a situação (aguardando → em análise → resolvido).

## Indicador de resultado (pitch)
**% das denúncias de prioridade ALTA que já receberam ação da prefeitura** e **tempo mediano até a primeira ação** (horas). Ambos aparecem na faixa do topo do app e no painel (`/api/stats`). Meta: mais urgentes tratados, em menos tempo, antes da próxima chuva forte.

## Como a IA é usada (e corrigida)
| Onde | O que faz | Controle humano / segurança |
|---|---|---|
| `server/ai.js` | Gemini recebe a foto, categoria e descrição e devolve JSON estruturado (schema fixo) | Saída validada; resposta inválida é descartada |
| `server/priority.js` | Regras de segurança locais (palavras de perigo imediato, pessoas expostas) | **A IA nunca rebaixa** um relato de perigo imediato; se a IA falhar ou estiver sem chave, as regras assumem |
| Painel `/painel.html` | Defesa Civil confere cada sugestão | Correções ficam registradas (`revisada_por_humano`, `prioridade_ia` original preservada) |
| Prompt | A descrição do morador é tratada como dado, não como instrução | Mitiga prompt injection |

**Correções feitas à IA durante o desenvolvimento:** _(preencher: ex. IA classificava "lixo no canal perto de casas" como baixa → adicionamos regra de exposição de pessoas)_.

## O que mudou depois da conversa com o validador
_(preencher após a Sessão Da Lama ao Caos e o teste do Dia 2: o que travou, o que simplificamos)_

## Dados do Recife
- **OpenStreetMap**: mapa-base e endereço aproximado (bairro/rua) do ponto via Nominatim.
- Os pontos de **exemplo** carregados no mapa são **fictícios** e vêm identificados como "Exemplo fictício" (`server/seed.js`). Desativar com `SEED=false`.
- Próximo passo: cruzar com áreas de risco de `dados.recife.pe.gov.br` e dados de chuva Apac/Cemaden.

## Acessibilidade
Letras grandes (18px) e botão **A+**; botões de 56px; contraste alto; prioridade sempre com **cor + símbolo + palavra** (▲ ALTA, ◆ MÉDIA, ● BAIXA); ícones com texto; passos curtos com linguagem simples; botão **🔊 Ouvir**; navegação por teclado, foco visível, `labels` e `aria-live`; link "pular para o mapa"; respeita `prefers-reduced-motion`; número 199 clicável.

## Como rodar
```bash
npm install               # também compila o Tailwind (npm run build)
cp .env.example .env        # opcional: coloque GEMINI_API_KEY (gratuita: aistudio.google.com/apikey)
npm start                   # http://localhost:3000
npm test                    # testes automatizados
```
Sem `GEMINI_API_KEY` o app funciona com as regras de segurança. Sem `DATABASE_URL` usa um arquivo JSON local; com `DATABASE_URL` usa PostgreSQL (tabela criada automaticamente).

Variáveis: `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_PIN` (PIN do painel; **troque**), `DATABASE_URL`, `SEED`, `PORT`.

## Deploy (Render)
Crie um *Web Service* a partir deste repositório (o `render.yaml` já configura, incluindo `npm run build` do Tailwind). Defina `GEMINI_API_KEY` e, para persistir os dados, `DATABASE_URL` de um PostgreSQL gratuito (Neon/Supabase/Render). O `ADMIN_PIN` é gerado pelo Render (veja em *Environment*).

## Testes (CI)
12 testes com `node:test` em `test/` (regras de prioridade, integração com a IA simulada, validações da API, auditoria humana com PIN). Executados no GitHub Actions (`.github/workflows/ci.yml`).

## Stack
Node.js 20+ · Express · Tailwind CSS 3 (compilado no build) · Lucide (ícones SVG) · Leaflet + OpenStreetMap · JS puro no front · PostgreSQL (opcional) · Gemini Flash-Lite.

## Limitações conhecidas (MVP)
Sem login de cidadão (confirmação por aparelho); PIN único para o painel; fotos guardadas no banco já comprimidas (≤1024px); moderação de conteúdo se apoia na checagem de coerência da IA + revisão humana.
