# 🌧️ De Olho no Risco

> Hackathon APONTI Academy – Desafio **Antena na Lama** · Caminho **1. Prevenir e cuidar (antes da crise)**

**Ideia em uma frase:** qualquer morador do Recife denuncia no mapa, com foto, um problema que agrava alagamentos e deslizamentos (encosta rachada, lixo no canal, bueiro entupido…); uma IA cruza a foto e o relato com os **dados oficiais da Defesa Civil**, sugere a prioridade, a Defesa Civil confere e encaminha ao órgão certo **antes** da chuva.

🔗 **Deploy público:** _preencher o link (Render)_ · **Painel da Defesa Civil:** `/painel.html` · **Roteiro do pitch:** [docs/PITCH.md](docs/PITCH.md)

## Problema
Rios, canais e encostas da RMR ficam entupidos ou instáveis, e a prefeitura só descobre depois da tragédia (maio/2022: +120 mortes em PE). A informação sobre quais pontos são mais urgentes não chega a quem pode agir — e quem denuncia nunca sabe se alguém viu.

## Fluxo principal (ponta a ponta)
1. Morador abre o site no celular e toca em **Denunciar um problema**.
2. Escolhe o tipo (botões grandes com ícone) e marca o local (GPS ou toque no mapa). **Se o ponto fica numa área de risco oficial da Defesa Civil, o app avisa na hora** e reforça o 199.
3. Envia **foto + descrição curta**.
4. O servidor busca o endereço (OpenStreetMap), cruza com os **dados abertos da Defesa Civil do Recife** e a **IA (Gemini Flash-Lite)** analisa foto + relato + contexto oficial: prioridade, motivo em linguagem simples, orientação de segurança e se a foto é coerente.
5. O ponto aparece no mapa e na **lista acessível**; outros moradores podem **confirmar ("Também vi isso aqui")**.
6. A **Defesa Civil** (`/painel.html`) vê a fila "Aguardando revisão", **confirma ou corrige a prioridade da IA**, muda a situação e gera com IA o **encaminhamento ao órgão responsável** (Defesa Civil, Emlurb, Meio Ambiente).
7. O morador acompanha em **Minhas** e recebe um aviso no app quando a situação muda (aguardando → em análise → atendido).

## Indicador de resultado (pitch)
| Indicador | O que mostra | Onde aparece |
|---|---|---|
| **% das denúncias de prioridade ALTA que já receberam ação** | a informação de risco chegou e virou ação | faixa do topo, painel, `/api/stats` |
| **Tempo mediano até a primeira ação (horas)** | decisões mais rápidas, antes da chuva | painel, `/api/stats` |

Meta: mais urgentes tratados, em menos tempo, antes da próxima chuva forte.

## Como a IA é usada (e corrigida)
| Onde | O que faz | Controle humano / segurança |
|---|---|---|
| `server/ai.js` – triagem | Gemini recebe foto, categoria, descrição **e os dados oficiais do local** e devolve JSON com schema fixo | Saída validada; resposta inválida é descartada; se o modelo for aposentado (404) tenta o próximo; se tudo falhar, as regras assumem |
| `server/priority.js` – regras | Perigo imediato, pessoas expostas, **área de risco oficial** e **histórico do bairro** | **A IA nunca rebaixa**: perigo imediato ⇒ piso ALTA; área de risco oficial ⇒ piso MÉDIA |
| `server/ai.js` – encaminhamento | IA redige o ofício ao órgão responsável a partir de um modelo com os fatos da denúncia | Só pode usar fatos do modelo; a Defesa Civil revisa e copia; sem IA, usa o modelo |
| Painel `/painel.html` | Defesa Civil confere cada sugestão | Correções ficam registradas (`revisada_por_humano`, `prioridade_ia` original preservada) |
| Prompt | A descrição do morador é tratada como dado, não como instrução | Mitiga prompt injection (há teste) |

**Correções feitas à IA durante o desenvolvimento:**
- O modelo `gemini-2.5-flash-lite` foi aposentado pelo Google e passou a responder **404**: o app caía silenciosamente nas regras e ninguém percebia. Trocamos para `gemini-3.5-flash-lite`, adicionamos fallback automático de modelo, `/api/health` informa se a IA está configurada e há teste para o caso.
- A IA não conhecia o território: classificava igual um bueiro no Centro e um bueiro dentro de uma área de risco nível 4 no Ibura. Passamos a enviar os **dados oficiais da Defesa Civil** no prompt e criamos um **piso de segurança** (nunca "baixa" em área de risco oficial).
- _(preencher: outros casos observados no teste com o validador)_

## Dados do Recife (kit de dados abertos)
| Base | Uso no app |
|---|---|
| **Defesa Civil – Áreas de Risco da Regional Sul** (dados.recife.pe.gov.br, ODbL) — 401 pontos | camada roxa no mapa (desligada por padrão: botão "Áreas de risco oficiais"); aviso ao marcar o local; piso de prioridade; contexto da IA |
| **Defesa Civil – Registro de Atendimentos 2024** (dados.recife.pe.gov.br, ODbL) — 80 mil atendimentos, 104 bairros | histórico do bairro (atendimentos, imóveis R3/R4, lonas, alagamentos) exibido ao morador, usado nas regras e no prompt |
| **OpenStreetMap** | mapa-base e endereço aproximado (Nominatim) |

Os arquivos compactos ficam em `server/data/` e são gerados por `node scripts/build-recife-data.js` (baixa direto do portal). A base de áreas de risco publicada cobre só a Regional Sul; o histórico de atendimentos cobre a cidade toda.

Os pontos de **exemplo** do mapa são **fictícios** e aparecem como "Exemplo fictício" (`server/seed.js`); o contexto oficial ligado a eles é real. Desativar com `SEED=false`.

## Acessibilidade
Letras grandes (18px) e botão **A+**; botões de 44–56px; contraste alto; prioridade sempre com **cor + símbolo + palavra** (▲ ALTA, ◆ MÉDIA, ● BAIXA, ✔ ATENDIDO); **visualização em lista** como alternativa ao mapa (leitor de tela e teclado); ícones com texto; passos curtos com linguagem simples; botão **🔊 Ouvir**; foco visível, `labels` e `aria-live`; link "pular para o mapa"; respeita `prefers-reduced-motion`; números 199/193 clicáveis.

## Como rodar
```bash
npm install                 # também compila o Tailwind (npm run build)
cp .env.example .env        # coloque GEMINI_API_KEY (gratuita: aistudio.google.com/apikey)
npm start                   # http://localhost:3000 (o .env é carregado automaticamente)
npm test                    # testes automatizados
```
Sem `GEMINI_API_KEY` o app funciona com as regras de segurança. Sem `DATABASE_URL` usa `data/db.json`; com `DATABASE_URL` usa PostgreSQL (tabela criada automaticamente). Para recarregar os exemplos, apague `data/db.json`.

Variáveis: `GEMINI_API_KEY`, `GEMINI_MODEL` (padrão `gemini-3.5-flash-lite`), `ADMIN_PIN` (PIN do painel; **troque**), `DATABASE_URL`, `SEED`, `PORT`.

## API
`GET /api/reports` · `POST /api/reports` · `POST /api/reports/:id/confirm` · `GET /api/stats` · `GET /api/risk-areas` · `GET /api/sources` · `GET /api/health` · Admin (cabeçalho `x-admin-pin`): `GET /api/admin/reports` · `PATCH /api/admin/reports/:id` · `POST /api/admin/reports/:id/encaminhamento`.

## Deploy (Render)
Crie um *Web Service* a partir deste repositório (o `render.yaml` já configura, incluindo `npm run build` do Tailwind). Defina `GEMINI_API_KEY` e, para persistir os dados, `DATABASE_URL` de um PostgreSQL gratuito (Neon/Supabase/Render). O `ADMIN_PIN` é gerado pelo Render (veja em *Environment*).

## Testes (CI)
21 testes com `node:test` em `test/`: regras de prioridade, dados oficiais (área de risco, histórico do bairro, piso de segurança), IA simulada (validação, fallback de modelo, prompt injection), encaminhamento, indicadores (% de urgentes com ação, mediana), validações da API e auditoria humana com PIN. Executados no GitHub Actions (`.github/workflows/ci.yml`).

## Stack
Node.js 20+ · Express · Tailwind CSS 3 · Lucide · Leaflet + OpenStreetMap · JS puro no front · PostgreSQL (opcional) · Gemini Flash-Lite · Dados Abertos do Recife.

## Limitações conhecidas (MVP)
Sem login de cidadão ("Minhas" e confirmações ficam no aparelho); PIN único para o painel; avisos de mudança aparecem quando o morador abre o app (não há push/WhatsApp ainda); áreas de risco oficiais só da Regional Sul; fotos guardadas no banco já comprimidas (≤1024px).
