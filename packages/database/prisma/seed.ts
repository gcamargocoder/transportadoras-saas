// Seed inicial:
// - dados de referencia GLOBAIS (operadoras de tag de pedagio);
// - um tenant padrao de desenvolvimento, suas configuracoes (TenantSettings)
//   e um usuario administrador -- para permitir testar login (tenantId +
//   email) e a API de usuarios/tenant sem precisar chamar POST /tenants
//   manualmente a cada `db:seed`.
// Idempotente: todo upsert usa uma chave unica do schema, seguro rodar
// multiplas vezes.
import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const TAG_PROVIDERS = ['Sem Parar', 'ConectCar', 'Veloe', 'Move Mais'];

const DEV_TENANT = {
  name: 'Transportadora Demo Ltda.',
  tradeName: 'Demo Transportes',
  document: '00000000000191',
  slug: 'demo',
};

const DEV_ADMIN = {
  name: 'Administrador Demo',
  email: 'admin@demo.com',
  password: 'Demo@12345',
  role: UserRole.ADMIN,
};

async function seedTagProviders(): Promise<void> {
  for (const name of TAG_PROVIDERS) {
    await prisma.tagProvider.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`- ${TAG_PROVIDERS.length} operadoras de tag de pedagio.`);
}

async function seedDevTenant(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { document: DEV_TENANT.document },
    update: {},
    create: DEV_TENANT,
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id },
  });

  const passwordHash = await argon2.hash(DEV_ADMIN.password, { type: argon2.argon2id });
  await prisma.userAccount.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: DEV_ADMIN.email } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: DEV_ADMIN.name,
      email: DEV_ADMIN.email,
      passwordHash,
      role: DEV_ADMIN.role,
      isActive: true,
    },
  });

  console.log(
    `- Tenant de desenvolvimento: "${tenant.name}" (id=${tenant.id}, slug=${tenant.slug}).`,
  );
  console.log(
    `- Login de teste: tenantId=${tenant.id}, email=${DEV_ADMIN.email}, senha=${DEV_ADMIN.password}`,
  );
}

async function main(): Promise<void> {
  await seedTagProviders();
  await seedDevTenant();
  console.log('Seed concluido.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
