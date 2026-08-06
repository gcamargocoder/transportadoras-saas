import helmet from 'helmet';

type HelmetOptions = Parameters<typeof helmet>[0];

// Configuracao central do Helmet -- separada do main.ts para ser testavel/
// revisavel isoladamente. swaggerEnabled controla o CSP: o bundle padrao do
// swagger-ui-dist (montado apenas fora de producao, ver main.ts) precisa de
// script/style inline; a API em si so responde JSON e nunca depende disso.
export function buildHelmetOptions(isProduction: boolean, swaggerEnabled: boolean): HelmetOptions {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: swaggerEnabled ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        styleSrc: swaggerEnabled ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // API JSON pura -- COEP/CORP restritivos por padrao servem paginas que
    // "embutem" outros recursos, nao e o nosso caso. Desligar COEP evita
    // quebrar consumidores (SPA em outra origem) sem ganho real de isolamento.
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    // HSTS so faz sentido (e so e respeitado pelo navegador) sobre HTTPS --
    // em dev/test a API roda em HTTP puro; habilitar aqui poderia "fixar" o
    // navegador do desenvolvedor a exigir HTTPS em localhost sem necessidade.
    hsts: isProduction ? { maxAge: 15_552_000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    hidePoweredBy: true,
    xssFilter: true,
    ieNoOpen: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    originAgentCluster: true,
  };
}
