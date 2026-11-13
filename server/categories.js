// Categorias de denúncia preventiva. "base" é o risco inicial usado pelas regras de segurança.
// "orgao" é quem costuma resolver na Prefeitura do Recife; o painel usa isso para encaminhar o caso.
const DEFESA_CIVIL = 'Defesa Civil do Recife (vistoria, lonas e contenção de encostas)';
const EMLURB = 'Emlurb (limpeza de canais, galerias e drenagem)';

export const CATEGORIES = [
  { id: 'encosta', nome: 'Encosta rachada ou barreira instável', curto: 'Encosta / barreira', icone: '⛰️', base: 'media', orgao: DEFESA_CIVIL },
  { id: 'muro', nome: 'Muro ou casa com risco de desabar', curto: 'Muro / casa em risco', icone: '🧱', base: 'media', orgao: DEFESA_CIVIL },
  { id: 'canal_lixo', nome: 'Lixo em rio, canal ou córrego', curto: 'Lixo no canal', icone: '🗑️', base: 'baixa', orgao: EMLURB },
  { id: 'bueiro', nome: 'Bueiro ou galeria entupida', curto: 'Bueiro entupido', icone: '🕳️', base: 'baixa', orgao: EMLURB },
  { id: 'alagamento', nome: 'Rua que alaga quando chove', curto: 'Ponto de alagamento', icone: '🌊', base: 'media', orgao: EMLURB },
  { id: 'erosao', nome: 'Erosão, buraco ou barranco cedendo', curto: 'Erosão / buraco', icone: '🚧', base: 'media', orgao: DEFESA_CIVIL },
  { id: 'arvore', nome: 'Árvore com risco de cair', curto: 'Árvore em risco', icone: '🌳', base: 'baixa', orgao: 'Emlurb (poda e corte de árvores) e Defesa Civil' },
  { id: 'mangue', nome: 'Mangue aterrado, queimado ou com lixo', curto: 'Mangue degradado', icone: '🌿', base: 'baixa', orgao: 'Secretaria de Meio Ambiente do Recife' },
  { id: 'outro', nome: 'Outro risco para a chuva forte', curto: 'Outro risco', icone: '⚠️', base: 'baixa', orgao: DEFESA_CIVIL },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const getCategory = (id) => CATEGORIES.find((c) => c.id === id);
