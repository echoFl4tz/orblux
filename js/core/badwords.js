/* =========================================================
   Lista de palavrões / termos ofensivos em pt-BR
   --- ARQUIVO FÁCIL DE EDITAR ---
   • um termo por linha, sem acento e em minúsculas
     (a comparação normaliza acentos e maiúsculas sozinha);
   • termos com espaço são tratados como frases ("pau no cu");
   • a comparação é por PALAVRA INTEIRA (não por pedaço), então
     "cu" não bloqueia "luciano". Termos com 5+ letras também são
     casados comosubstring para pegar formas coladas ("merda"→"merdinha").
   Ajuste esta lista ao seu público — é a única fonte de verdade.
   ========================================================= */

export const BADWORDS = [
  // palavrões fortes
  'caralho', 'caralhudo', 'porra', 'puta', 'puto', 'putaria',
  'buceta', 'boceta', 'xoxota', 'cuzao', 'cuzinho', 'cu', 'pau no cu',
  'merda', 'merdinha', 'bosta', 'bostada', 'cagada',
  'foda-se', 'fodase', 'foder', 'fudido', 'fuder', 'transar',
  'punheta', 'gozado', 'gozar', 'chupa', 'chupar', 'penis', 'vagina',

  // expressões de internet / abreviações
  'pqp', 'vsf', 'vtnc', 'fdp', 'krl', 'ctputa',

  // insultos / xingamentos comuns
  'otario', 'otaria', 'arrombado', 'arrombada', 'idiota', 'imbecil',
  'babaca', 'escroto', 'escrota', 'corno', 'cornudo', 'broxa',
  'sapatao', 'sapatona', 'veado', 'viado', 'viadao', 'bicha',

  // termos discriminatórios (slurs — bloqueados por padrão)
  // (evite colocar cores/corpos legítimos aqui — "preto", "gordo" etc.
  //  podem ser nomes próprios; adicione só o que seu público considerar ofensivo)
  'macaco', 'macaca',
];
