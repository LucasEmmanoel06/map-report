// DADOS FICTÍCIOS para demonstração. Todos são marcados com ficticio:true e aparecem como "Exemplo" no app.
const now = Date.now();
const h = (n) => new Date(now - n * 3600_000).toISOString();

const base = [
  ['encosta', -8.0140, -34.8890, 'Alto José do Pinho', 'Rachadura grande na encosta, há casas embaixo com crianças morando.', 'alta', 'aberta', 30],
  ['canal_lixo', -8.0258, -34.9120, 'Casa Amarela', 'Canal cheio de sacolas e garrafas, a água já quase não passa.', 'media', 'em_analise', 50],
  ['bueiro', -8.0850, -34.8730, 'Brasília Teimosa', 'Bueiro da esquina entupido por folhas e lixo.', 'baixa', 'aberta', 12],
  ['alagamento', -8.0630, -34.8710, 'Recife', 'Rua perto do rio que enche toda vez que a maré sobe com chuva.', 'media', 'aberta', 70],
  ['muro', -8.1200, -34.9350, 'Ibura', 'Muro de contenção inclinado, parte já caiu na última chuva.', 'alta', 'em_analise', 20],
  ['mangue', -8.0520, -34.8830, 'Santo Amaro', 'Lixo e entulho jogados no manguezal perto da ponte.', 'baixa', 'aberta', 90],
  ['erosao', -8.0450, -34.9500, 'Várzea', 'Barranco cedendo ao lado da calçada, buraco aumentando.', 'media', 'aberta', 8],
  ['arvore', -8.0000, -34.9030, 'Dois Unidos', 'Árvore grande inclinada sobre fios, perto de uma escola.', 'media', 'resolvida', 140],
  ['canal_lixo', -8.0780, -34.9060, 'Afogados', 'Colchões e entulho no canal, risco de transbordar.', 'alta', 'aberta', 5],
  ['bueiro', -8.1500, -34.9400, 'Jordão', 'Galeria entupida, água empoça na rua da creche.', 'media', 'aberta', 40],
  // Casos já atendidos pela prefeitura (status "resolvida" = nível "Atendido" no app)
  ['encosta', -8.0330, -34.9250, 'Córrego do Jenipapo', 'Barreira com rachadura foi contida com muro de arrimo pela prefeitura.', 'alta', 'resolvida', 120],
  ['canal_lixo', -8.0690, -34.9310, 'Torrões', 'Canal limpo pela equipe da prefeitura, entulho retirado.', 'media', 'resolvida', 100],
];

export function seedReports() {
  return base.map(([categoria, lat, lng, bairro, descricao, prioridade, status, horas], i) => ({
    id: `exemplo-${i + 1}`,
    categoria,
    descricao,
    lat,
    lng,
    bairro,
    rua: null,
    prioridade,
    prioridade_ia: prioridade,
    revisada_por_humano: false,
    motivo: 'Exemplo fictício para demonstração.',
    orientacao: 'Em caso de perigo imediato, ligue 199 (Defesa Civil).',
    fonte_prioridade: 'regras',
    foto_coerente: true,
    tem_foto: false,
    ficticio: true,
    status,
    confirmacoes: [],
    criado_em: h(horas),
    primeira_acao_em: status === 'aberta' ? null : h(Math.max(horas - 6, 1)),
    resolvido_em: status === 'resolvida' ? h(horas - 30) : null,
  }));
}
