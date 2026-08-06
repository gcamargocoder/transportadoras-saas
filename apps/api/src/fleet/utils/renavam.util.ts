// Ao contrario do CPF/CNPJ, RENAVAM nao tem uma mascara de formatacao
// convencionada (pontos/tracos) -- entao aqui so removemos espacos nas
// pontas, nunca digitos ou letras embutidos.
export function normalizeRenavam(renavam: string): string {
  return renavam.trim();
}

// RENAVAM nao tem um digito verificador publicamente padronizado como o CPF
// -- a validacao adotada aqui e a de formato oficial do DENATRAN: apenas
// digitos, entre 9 e 11 caracteres (o padrao atual usa 11 digitos;
// RENAVAMs legados podem ter menos e sao preenchidos com zeros a esquerda).
export function isValidRenavam(value: string): boolean {
  return /^\d{9,11}$/.test(normalizeRenavam(value));
}
