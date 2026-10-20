// Limite do Conta Azul: 10 req/s (600/min) por conta conectada. Um intervalo
// mínimo de 110 ms entre chamadas fica abaixo disso com folga. Módulo puro;
// relógio e espera injetáveis para o teste.

export interface Relogio {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const relogioReal: Relogio = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export const INTERVALO_MINIMO_MS = 110;

/**
 * Devolve uma função para chamar antes de cada requisição. A reserva do horário
 * é síncrona, então chamadas concorrentes também ficam espaçadas.
 */
export function criarLimitador(intervaloMs = INTERVALO_MINIMO_MS, relogio: Relogio = relogioReal) {
  let proximo = 0;
  return async function aguardarVez(): Promise<void> {
    const agora = relogio.now();
    const minha = Math.max(agora, proximo);
    proximo = minha + intervaloMs;
    if (minha > agora) await relogio.sleep(minha - agora);
  };
}
