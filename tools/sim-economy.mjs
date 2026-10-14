/* =========================================================
   SIMULADOR DA ECONOMIA — imprime em markdown as tabelas do
   ECONOMIA.md (rodar e colar a saída ao mudar qualquer número).

   Não altera nada: só importa os módulos puros e calcula.
   Uso: node tools/sim-economy.mjs
   ========================================================= */

import { calcRunCoins, missionCoins, achievementCoins, dailyReward, SKIN_PRICES, CAP_POR_PARTIDA } from '../js/core/economy.js';
import { SKINS } from '../js/game/skins.js';

// Missões do dia: 3 modelos sorteados de 8 (3 fáceis, 3 médias, 2 difíceis)
// -> soma diária entre 75 e 125 moedas; usamos 100 como média honesta.
const MISSOES_DIA = 100;

// Perfis de sessão (partidas por dia com MESMA qualidade)
const PERFIS = [
  { nome: 'Fraco (iniciante)', partidas: 3, run: { pickups: 15, score: 800, seconds: 35 } },
  { nome: 'Médio (casual)', partidas: 5, run: { pickups: 40, score: 2500, seconds: 70 } },
  { nome: 'Forte (viciado)', partidas: 8, run: { pickups: 70, score: 6000, seconds: 120 } },
];

const money = (n) => n.toLocaleString('pt-BR');
const lines = [];
const p = (s = '') => lines.push(s);

/* ---------- 1. Ganho por partida ---------- */
p('### 1. Ganho por partida');
p();
p('| Perfil | Pulsos | Pontos | Seg | Sem bônus | +1ª do dia | +recorde | Os dois |');
p('|--------|-------:|-------:|----:|----------:|-----------:|---------:|--------:|');
for (const f of PERFIS) {
  const base = calcRunCoins(f.run);
  const um = calcRunCoins({ ...f.run, firstRunToday: true });
  const rec = calcRunCoins({ ...f.run, recordBroken: true });
  const dois = calcRunCoins({ ...f.run, recordBroken: true, firstRunToday: true });
  p(`| ${f.nome} | ${f.run.pickups} | ${f.run.score} | ${f.run.seconds} | ${base} | ${um} | ${rec} | ${dois} |`);
}
p(`| *teto por partida* | — | — | — | **${CAP_POR_PARTIDA}** +25 | — | — | — |`);
p();

/* ---------- 2. Envelope diário ---------- */
p('### 2. Ganho por dia (partidas + 1ª do dia + 3 missões + recompensa diária do dia 1)');
p();
p('| Perfil | Partidas | Base das partidas | 1ª do dia | Missões (média) | Diária (dia 1) | **Total/dia** |');
p('|--------|---------:|------------------:|----------:|----------------:|---------------:|--------------:|');
const diarios = [];
for (const f of PERFIS) {
  const base = calcRunCoins(f.run);
  const total = base * f.partidas + 10 + MISSOES_DIA + dailyReward(1);
  diarios.push(total);
  p(`| ${f.nome} | ${f.partidas} | ${base} × ${f.partidas} = ${base * f.partidas} | 10 | ${MISSOES_DIA} | ${dailyReward(1)} | **${money(total)}** |`);
}
p();

/* ---------- 3. Dias até comprar ---------- */
const precos = [
  ['Faixa A (8 skins)', SKIN_PRICES.A],
  ['Faixa B (8 skins)', SKIN_PRICES.B],
  ['Faixa C (3 skins)', SKIN_PRICES.C],
  ['Lendária (1 skin)', SKIN_PRICES.L],
];
p('### 3. Dias de jogo até comprar (preço ÷ total/dia; sem conquistas, que são eventuais)');
p();
p(`| Item | Preço em moedas | ${PERFIS.map((f) => f.nome).join(' | ')} |`);
p(`|------|----------------:|${PERFIS.map(() => '----------------:').join('|')}|`);
for (const [rotulo, preco] of precos) {
  const dias = diarios.map((d) => Math.ceil(preco / d));
  p(`| ${rotulo} | ${money(preco)} | ${dias.map((n) => `${n} dia${n > 1 ? 's' : ''}`).join(' | ')} |`);
}
p();

/* ---------- 4. Coleção completa com moedas ---------- */
const totalColecao = SKINS.filter((s) => s.tier !== 'free').reduce((a, s) => a + (s.coinPrice || 0), 0);
p('### 4. Coleção completa só jogando (20 skins)');
p();
p(`| Valor total | ${PERFIS.map((f) => f.nome).join(' | ')} |`);
p(`|------------:|${PERFIS.map(() => '---------------:').join('|')}|`);
p(`| ${money(totalColecao)} moedas | ${diarios.map((d) => `${Math.ceil(totalColecao / d)} dias`).join(' | ')} |`);
p();

/* ---------- 5. Referências rápidas ---------- */
p('### 5. Valores de referência');
p();
p(`- Recompensa diária por dia de sequência: ${dailyReward(1)}, ${dailyReward(2)}, ${dailyReward(3)}, ${dailyReward(4)}, ${dailyReward(5)}, ${dailyReward(6)}, ${dailyReward(7)} (ciclo repete no dia 8).`);
p(`- Missões: ${missionCoins('facil')} (fácil) / ${missionCoins('medio')} (média) / ${missionCoins('dificil')} (difícil) — 3 por dia.`);
p(`- Conquistas (14 no total): ${achievementCoins('pequena')} / ${achievementCoins('media')} / ${achievementCoins('grande')} — uma vez cada.`);
p(`- Piso de uma partida: 0 moedas (menos de 10 s). Teto: ${CAP_POR_PARTIDA} + bônus.`);

console.log(lines.join('\n'));
