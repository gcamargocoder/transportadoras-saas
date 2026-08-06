// Gera um slug URL-safe a partir do nome da empresa (usado quando o
// cliente nao informa um slug explicito ao criar o tenant). Preparado para
// a futura resolucao de tenant por subdominio (ex: "acme" -> acme.app.com).
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (a -> a, c -> c, ...)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
