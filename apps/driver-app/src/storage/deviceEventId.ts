// Id unico gerado pelo dispositivo (Fase 25) -- usado como chave de
// idempotencia em todo evento operacional enviado ao backend (localizacao,
// parada, abastecimento, evento de eixo). Nao precisa ser um UUID v4
// criptografico -- so precisa ser unico por dispositivo, o que
// timestamp + contador + aleatorio garante na pratica.
let counter = 0;

export function generateDeviceEventId(): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `dev-${Date.now().toString(36)}-${counter}-${random}`;
}
