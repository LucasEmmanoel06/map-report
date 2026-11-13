// Categorias de denúncia preventiva. "base" é o risco inicial usado pelas regras de segurança.
export const CATEGORIES = [
  { id: 'encosta', nome: 'Encosta rachada ou barreira instável', curto: 'Encosta / barreira', icone: '⛰️', base: 'media' },
  { id: 'muro', nome: 'Muro ou casa com risco de desabar', curto: 'Muro / casa em risco', icone: '🧱', base: 'media' },
  { id: 'canal_lixo', nome: 'Lixo em rio, canal ou córrego', curto: 'Lixo no canal', icone: '🗑️', base: 'baixa' },
  { id: 'bueiro', nome: 'Bueiro ou galeria entupida', curto: 'Bueiro entupido', icone: '🕳️', base: 'baixa' },
  { id: 'alagamento', nome: 'Rua que alaga quando chove', curto: 'Ponto de alagamento', icone: '🌊', base: 'media' },
  { id: 'erosao', nome: 'Erosão, buraco ou barranco cedendo', curto: 'Erosão / buraco', icone: '🚧', base: 'media' },
  { id: 'arvore', nome: 'Árvore com risco de cair', curto: 'Árvore em risco', icone: '🌳', base: 'baixa' },
  { id: 'mangue', nome: 'Mangue aterrado, queimado ou com lixo', curto: 'Mangue degradado', icone: '🌿', base: 'baixa' },
  { id: 'outro', nome: 'Outro risco para a chuva forte', curto: 'Outro risco', icone: '⚠️', base: 'baixa' },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const getCategory = (id) => CATEGORIES.find((c) => c.id === id);
