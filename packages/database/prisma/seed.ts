// Seed inicial:
// - dados de referencia GLOBAIS (operadoras de tag de pedagio);
// - um tenant padrao de desenvolvimento, suas configuracoes (TenantSettings)
//   e um usuario administrador -- para permitir testar login (tenantId +
//   email) e a API de usuarios/tenant sem precisar chamar POST /tenants
//   manualmente a cada `db:seed`.
// - (Fase 22) uma cadeia operacional minima -- motorista, veiculo com tag
//   ativa, composicao com configuracao de eixos, locais e uma viagem --
//   para o seletor de "Viagem" no registro de pedagio ter uma opcao real
//   para escolher, e duas transacoes de pedagio de exemplo (uma correta,
//   uma acima do esperado) demonstrando o motor de conferencia.
// - (Fase 23) uma rota de pedagio demo com 4 pracas (A/B/C/D) vinculada a
//   essa mesma viagem, com transacoes que demonstram os 4 cenarios de
//   conciliacao: praca A correta, praca B acima do esperado, praca C nunca
//   registrada (NOT_REGISTERED) e praca D sem tarifa cadastrada
//   (UNVERIFIABLE). As 2 transacoes do Fase 22 (numa praca fora da rota)
//   passam a demonstrar "pedagio nao previsto" de graca, sem duplicar dado.
// - (Fase 24) uma 5a praca (E) na mesma rota demo, cobrada ABAIXO do
//   esperado (UNDERCHARGE) -- unico veredito que faltava no seed.
// Idempotente: upsert onde ha chave unica no schema; nos modelos sem chave
// unica de negocio (Driver/Vehicle/Trip/TollTransaction/TollPlaza/TollRoute)
// usa find-or-create por um identificador fixo e reconhecivel (ex: placa
// "DEV0A01", nome de praca "Praca Demo A (Fase 23)"), seguro rodar
// multiplas vezes sem duplicar.
import * as argon2 from 'argon2';
import {
  LocationType,
  PrismaClient,
  TollTransactionSource,
  TripPriority,
  TripStatus,
  UserRole,
  VehicleType,
} from '@prisma/client';

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

// Identificadores fixos e reconheciveis -- usados como chave de
// find-or-create (nao sao UUIDs reais, so texto estavel entre execucoes).
const DEV_DRIVER_CPF = '52998224725';
const DEV_VEHICLE_PLATE = 'DEV0A01';
const DEV_VEHICLE_TAG_NUMBER = '9999900001';
const DEV_ORIGIN_LOCATION_NAME = 'Centro de Distribuição Demo';
const DEV_DESTINATION_LOCATION_NAME = 'Filial Demo — Destino';

// Fase 23 -- pracas/rota demo para a conciliacao. Nomes fixos e
// reconheciveis (find-or-create por nome, TollPlaza nao tem chave unica de
// negocio no schema).
const DEV_ROUTE_PLAZA_A_NAME = 'Praça Demo A (Fase 23)';
const DEV_ROUTE_PLAZA_B_NAME = 'Praça Demo B (Fase 23)';
const DEV_ROUTE_PLAZA_C_NAME = 'Praça Demo C (Fase 23)';
const DEV_ROUTE_PLAZA_D_NAME = 'Praça Demo D — Sem Tarifa (Fase 23)';
const DEV_ROUTE_PLAZA_E_NAME = 'Praça Demo E — Abaixo do Esperado (Fase 24)';
const DEV_ROUTE_NAME = 'São José do Rio Preto → São Paulo (Demo)';
const DEV_ROUTE_PRICE_PER_AXLE = 10;

async function seedTagProviders(): Promise<void> {
  for (const name of TAG_PROVIDERS) {
    await prisma.tagProvider.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`- ${TAG_PROVIDERS.length} operadoras de tag de pedagio.`);
}

async function seedDevTenant(): Promise<{ tenantId: string; adminUserId: string }> {
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
  const admin = await prisma.userAccount.upsert({
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

  return { tenantId: tenant.id, adminUserId: admin.id };
}

// Fecha o elo Motorista -> Veiculo -> Composicao -> Viagem para o seletor
// de "Viagem" no registro de pedagio ter uma opcao real, e para o
// motor de conferencia ter algo para exibir de exemplo.
async function seedDevOperationalChain(tenantId: string): Promise<void> {
  const driver = await findOrCreateDriver(tenantId);
  const vehicle = await findOrCreateVehicle(tenantId);
  await findOrCreateVehicleTag(tenantId, vehicle.id);
  const composition = await findOrCreateComposition(tenantId, vehicle.id);
  const origin = await findOrCreateLocation(
    tenantId,
    DEV_ORIGIN_LOCATION_NAME,
    LocationType.DISTRIBUTION_CENTER,
  );
  const destination = await findOrCreateLocation(
    tenantId,
    DEV_DESTINATION_LOCATION_NAME,
    LocationType.BRANCH,
  );
  const trip = await findOrCreateTrip(tenantId, {
    driverId: driver.id,
    compositionId: composition.id,
    originLocationId: origin.id,
    destinationLocationId: destination.id,
  });

  console.log(
    `- Cadeia operacional demo: motorista "${driver.name}", veículo ${vehicle.plate} ` +
      `(6 eixos), viagem ${origin.name} → ${destination.name} (id=${trip.id}).`,
  );

  await seedDevTollTransactions(tenantId, trip.id, vehicle.id);
  await seedDevTollRouteReconciliationDemo(
    tenantId,
    trip.id,
    vehicle.id,
    composition.axleConfiguration?.totalAxles ?? 6,
  );
}

async function findOrCreateDriver(tenantId: string) {
  const existing = await prisma.driver.findFirst({ where: { tenantId, cpf: DEV_DRIVER_CPF } });
  if (existing) return existing;

  return prisma.driver.create({
    data: {
      tenantId,
      name: 'José da Silva (motorista demo)',
      cpf: DEV_DRIVER_CPF,
      cnhNumber: '99988877766',
      cnhCategory: 'AE',
      cnhExpiresAt: new Date('2028-12-31'),
      isActive: true,
    },
  });
}

async function findOrCreateVehicle(tenantId: string) {
  const existing = await prisma.vehicle.findFirst({
    where: { tenantId, plate: DEV_VEHICLE_PLATE },
  });
  if (existing) return existing;

  return prisma.vehicle.create({
    data: {
      tenantId,
      plate: DEV_VEHICLE_PLATE,
      brand: 'Volvo',
      model: 'FH 540 (demo)',
      type: VehicleType.TRACTOR_UNIT,
      axleCount: 6,
    },
  });
}

async function findOrCreateVehicleTag(tenantId: string, vehicleId: string): Promise<void> {
  const existing = await prisma.vehicleTag.findFirst({
    where: { tenantId, vehicleId, tagNumber: DEV_VEHICLE_TAG_NUMBER },
  });
  if (existing) return;

  const semParar = await prisma.tagProvider.findUnique({ where: { name: 'Sem Parar' } });
  if (!semParar) return;

  await prisma.vehicleTag.create({
    data: {
      tenantId,
      vehicleId,
      tagProviderId: semParar.id,
      tagNumber: DEV_VEHICLE_TAG_NUMBER,
      isActive: true,
      activatedAt: new Date('2026-01-01'),
    },
  });
}

async function findOrCreateComposition(tenantId: string, vehicleId: string) {
  const existing = await prisma.tripComposition.findFirst({
    where: { tenantId, vehicleId },
    include: { axleConfiguration: true },
  });
  if (existing) return existing;

  return prisma.tripComposition.create({
    data: {
      tenantId,
      vehicleId,
      axleConfiguration: {
        create: {
          tenantId,
          totalAxles: 6,
          raisedAxles: 0,
          loweredAxles: 4,
          suspendedAxles: 0,
          steeringAxles: 1,
          tractionAxles: 2,
          billableCategory: '6 eixos',
        },
      },
    },
    include: { axleConfiguration: true },
  });
}

async function findOrCreateLocation(tenantId: string, name: string, type: LocationType) {
  const existing = await prisma.location.findFirst({ where: { tenantId, name } });
  if (existing) return existing;

  return prisma.location.create({ data: { tenantId, name, type } });
}

async function findOrCreateTrip(
  tenantId: string,
  refs: {
    driverId: string;
    compositionId: string;
    originLocationId: string;
    destinationLocationId: string;
  },
) {
  const existing = await prisma.trip.findFirst({
    where: { tenantId, composition: { id: refs.compositionId }, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.trip.create({
    data: {
      tenantId,
      driverId: refs.driverId,
      composition: { connect: { id: refs.compositionId } },
      originLocationId: refs.originLocationId,
      destinationLocationId: refs.destinationLocationId,
      status: TripStatus.PLANNED,
      priority: TripPriority.NORMAL,
      plannedDeparture: new Date('2026-09-01T08:00:00.000Z'),
      plannedArrival: new Date('2026-09-02T18:00:00.000Z'),
      notes: 'Viagem de demonstração (seed de desenvolvimento).',
    },
  });
}

// Dois exemplos reais do motor de conferencia (Fase 22): uma cobranca
// correta e uma acima do esperado -- para o dashboard/registro de pedagio
// ja nascerem com dado real para mostrar, sem inventar tarifa (usa o
// pricePerAxle de uma praca ja seedada com tarifa cadastrada).
async function seedDevTollTransactions(
  tenantId: string,
  tripId: string,
  vehicleId: string,
): Promise<void> {
  const existing = await prisma.tollTransaction.count({ where: { tenantId, tripId } });
  if (existing > 0) return;

  const plaza = await prisma.tollPlaza.findFirst({
    where: { pricePerAxle: { not: null } },
    orderBy: { name: 'asc' },
  });
  if (!plaza || !plaza.pricePerAxle) return;

  const semParar = await prisma.tagProvider.findUnique({ where: { name: 'Sem Parar' } });
  const axleCount = 6;
  const pricePerAxle = Number(plaza.pricePerAxle);
  const expectedAmount = pricePerAxle * axleCount;

  await prisma.tollTransaction.create({
    data: {
      tenantId,
      tripId,
      vehicleId,
      tollPlazaId: plaza.id,
      tagProviderId: semParar?.id,
      axleCount,
      expectedAmount,
      chargedAmount: expectedAmount,
      discrepancyAmount: 0,
      status: 'NORMAL',
      chargedAt: new Date('2026-09-01T10:15:00.000Z'),
      source: TollTransactionSource.MANUAL,
    },
  });

  const overcharged = expectedAmount + 15;
  await prisma.tollTransaction.create({
    data: {
      tenantId,
      tripId,
      vehicleId,
      tollPlazaId: plaza.id,
      tagProviderId: semParar?.id,
      axleCount,
      expectedAmount,
      chargedAmount: overcharged,
      discrepancyAmount: overcharged - expectedAmount,
      status: 'DIVERGENT',
      chargedAt: new Date('2026-09-01T14:30:00.000Z'),
      source: TollTransactionSource.MANUAL,
    },
  });

  console.log(
    `- 2 transações de pedágio de exemplo na praça "${plaza.name}" ` +
      `(1 correta, 1 acima do esperado em R$ 15,00).`,
  );
}

// Fase 23/24 -- rota de pedagio demo (5 pracas) vinculada a mesma viagem
// demo, com transacoes que cobrem os 5 vereditos de conciliacao: praca A
// (CORRECT), praca B (OVERCHARGE, +R$15), praca C (nunca registrada ->
// NOT_REGISTERED), praca D (registrada mas sem pricePerAxle cadastrado ->
// UNVERIFIABLE), praca E (UNDERCHARGE, -R$20, Fase 24). As 2 transacoes ja
// criadas por seedDevTollTransactions ficam numa praca FORA desta rota --
// passam a demonstrar "pedagio nao previsto" na conciliacao, sem duplicar
// dado nem criar uma 3a viagem.
async function seedDevTollRouteReconciliationDemo(
  tenantId: string,
  tripId: string,
  vehicleId: string,
  axleCount: number,
): Promise<void> {
  const plazaA = await findOrCreateTollPlaza(DEV_ROUTE_PLAZA_A_NAME, DEV_ROUTE_PRICE_PER_AXLE);
  const plazaB = await findOrCreateTollPlaza(DEV_ROUTE_PLAZA_B_NAME, DEV_ROUTE_PRICE_PER_AXLE);
  const plazaC = await findOrCreateTollPlaza(DEV_ROUTE_PLAZA_C_NAME, DEV_ROUTE_PRICE_PER_AXLE);
  const plazaD = await findOrCreateTollPlaza(DEV_ROUTE_PLAZA_D_NAME, null);
  const plazaE = await findOrCreateTollPlaza(DEV_ROUTE_PLAZA_E_NAME, DEV_ROUTE_PRICE_PER_AXLE);

  let route = await prisma.tollRoute.findFirst({ where: { tenantId, name: DEV_ROUTE_NAME } });
  if (!route) {
    route = await prisma.tollRoute.create({
      data: {
        tenantId,
        name: DEV_ROUTE_NAME,
        originLabel: 'São José do Rio Preto',
        destinationLabel: 'São Paulo',
      },
    });
  }

  const stopCount = await prisma.tollRouteStop.count({ where: { tollRouteId: route.id } });
  if (stopCount === 0) {
    await prisma.tollRouteStop.createMany({
      data: [plazaA, plazaB, plazaC, plazaD, plazaE].map((plaza, index) => ({
        tenantId,
        tollRouteId: route!.id,
        tollPlazaId: plaza.id,
        sequence: index + 1,
      })),
    });
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (trip && !trip.tollRouteId) {
    await prisma.trip.update({ where: { id: tripId }, data: { tollRouteId: route.id } });
  }

  const expectedAmount = DEV_ROUTE_PRICE_PER_AXLE * axleCount;
  const alreadyRegistered = await prisma.tollTransaction.count({
    where: { tenantId, tripId, tollPlazaId: { in: [plazaA.id, plazaB.id, plazaD.id, plazaE.id] } },
  });
  if (alreadyRegistered === 0) {
    await prisma.tollTransaction.create({
      data: {
        tenantId,
        tripId,
        vehicleId,
        tollPlazaId: plazaA.id,
        axleCount,
        expectedAmount,
        chargedAmount: expectedAmount,
        discrepancyAmount: 0,
        status: 'NORMAL',
        chargedAt: new Date('2026-09-01T09:00:00.000Z'),
        source: TollTransactionSource.MANUAL,
      },
    });

    const overchargedB = expectedAmount + 15;
    await prisma.tollTransaction.create({
      data: {
        tenantId,
        tripId,
        vehicleId,
        tollPlazaId: plazaB.id,
        axleCount,
        expectedAmount,
        chargedAmount: overchargedB,
        discrepancyAmount: overchargedB - expectedAmount,
        status: 'DIVERGENT',
        chargedAt: new Date('2026-09-01T11:00:00.000Z'),
        source: TollTransactionSource.MANUAL,
      },
    });

    // Praca D nao tem pricePerAxle cadastrado -- expectedAmount/discrepancy
    // gravados como 0 (mesma limitacao pre-Fase-22 do calculo legado); o
    // auditVerdict/conciliacao (calculados em tempo de leitura) e que
    // corrigem isso para UNVERIFIABLE, sem inventar tarifa.
    await prisma.tollTransaction.create({
      data: {
        tenantId,
        tripId,
        vehicleId,
        tollPlazaId: plazaD.id,
        axleCount,
        expectedAmount: 0,
        chargedAmount: expectedAmount,
        discrepancyAmount: expectedAmount,
        status: 'DIVERGENT',
        chargedAt: new Date('2026-09-01T13:00:00.000Z'),
        source: TollTransactionSource.MANUAL,
      },
    });

    const underchargedE = expectedAmount - 20;
    await prisma.tollTransaction.create({
      data: {
        tenantId,
        tripId,
        vehicleId,
        tollPlazaId: plazaE.id,
        axleCount,
        expectedAmount,
        chargedAmount: underchargedE,
        discrepancyAmount: underchargedE - expectedAmount,
        status: 'DIVERGENT',
        chargedAt: new Date('2026-09-01T15:00:00.000Z'),
        source: TollTransactionSource.MANUAL,
      },
    });

    // Praca C fica deliberadamente SEM transacao -- demonstra
    // NOT_REGISTERED na conciliacao (praca esperada pela rota, nunca
    // registrada nesta viagem).
    console.log(
      `- Rota de pedágio demo "${route.name}" (5 praças) vinculada à viagem demo: ` +
        `A=CORRECT, B=OVERCHARGE (+R$15), C=NOT_REGISTERED, D=UNVERIFIABLE (sem tarifa), ` +
        `E=UNDERCHARGE (-R$20).`,
    );
  }
}

async function findOrCreateTollPlaza(name: string, pricePerAxle: number | null) {
  const existing = await prisma.tollPlaza.findFirst({ where: { name } });
  if (existing) return existing;

  return prisma.tollPlaza.create({
    data: {
      name,
      operator: 'CCR ViaOeste (demo)',
      highway: 'SP-310',
      pricePerAxle: pricePerAxle ?? undefined,
    },
  });
}

async function main(): Promise<void> {
  await seedTagProviders();
  const { tenantId } = await seedDevTenant();
  await seedDevOperationalChain(tenantId);
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
