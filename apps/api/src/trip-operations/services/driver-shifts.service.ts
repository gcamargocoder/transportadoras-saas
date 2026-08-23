import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverShift, ShiftBreak, TripStopType } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { StartDriverShiftDto } from '../dto/start-driver-shift.dto';
import { StartShiftBreakDto } from '../dto/start-shift-break.dto';
import { DriverShiftEntity } from '../entities/driver-shift.entity';
import { toDriverShiftEntity } from '../mappers/driver-shift.mapper';

const SHIFT_INCLUDE = { breaks: { orderBy: { startedAt: 'asc' as const } } };
type ShiftWithBreaks = DriverShift & { breaks: ShiftBreak[] };

// Fase 67 -- ativa DriverShift/ShiftBreak (orfaos ate esta fase, zero uso no
// codigo). Idempotencia POR ESTADO (nunca deviceEventId, o schema nao tem
// esse campo) -- mesmo principio ja usado em DriverTripsService.start/
// pause/resume/complete: reenviar start/end/pause/resume nunca duplica.
@Injectable()
export class DriverShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // POST /driver/shifts/start -- idempotente: se ja houver uma jornada
  // aberta para este motorista, devolve ela sem criar uma segunda.
  async start(
    tenantId: string,
    driverId: string,
    dto: StartDriverShiftDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverShiftEntity> {
    const open = await this.findOpenShift(tenantId, driverId);
    if (open) {
      return toDriverShiftEntity(open);
    }

    if (dto.tripId) {
      await this.assertTripExists(tenantId, dto.tripId);
    }

    const shift = await this.prisma.driverShift.create({
      data: {
        tenantId,
        driverId,
        tripId: dto.tripId ?? null,
        startedAt: new Date(),
      },
      include: SHIFT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'shift.started',
      entityName: 'DriverShift',
      entityId: shift.id,
      newValue: toJsonSafe({ driverId, tripId: shift.tripId, startedAt: shift.startedAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverShiftEntity(shift);
  }

  // POST /driver/shifts/:id/end -- idempotente. Se houver uma pausa em
  // aberto, encerra-a automaticamente no mesmo instante (uma jornada
  // encerrada nunca deixa uma pausa pendurada em aberto).
  async end(
    tenantId: string,
    driverId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverShiftEntity> {
    const before = await this.findOwnedOrThrow(tenantId, driverId, id);
    if (before.cancelledAt) {
      throw new ConflictException('Esta jornada foi cancelada e nao pode ser encerrada.');
    }
    if (before.endedAt) {
      return toDriverShiftEntity(before);
    }

    const endedAt = new Date();
    const openBreak = before.breaks.find((b) => b.endedAt === null);
    if (openBreak) {
      await this.prisma.shiftBreak.update({ where: { id: openBreak.id }, data: { endedAt } });
    }

    const shift = await this.prisma.driverShift.update({
      where: { id: before.id },
      data: { endedAt },
      include: SHIFT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'shift.closed',
      entityName: 'DriverShift',
      entityId: shift.id,
      newValue: toJsonSafe({ endedAt: shift.endedAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverShiftEntity(shift);
  }

  // POST /driver/shifts/:id/cancel -- correcao de uma jornada aberta por
  // engano. Idempotente; permitido tanto aberta quanto ja encerrada (mesmo
  // principio de TripStopsService.cancel).
  async cancel(
    tenantId: string,
    driverId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverShiftEntity> {
    const before = await this.findOwnedOrThrow(tenantId, driverId, id);
    if (before.cancelledAt) {
      return toDriverShiftEntity(before);
    }

    const shift = await this.prisma.driverShift.update({
      where: { id: before.id },
      data: { cancelledAt: new Date() },
      include: SHIFT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'shift.cancelled',
      entityName: 'DriverShift',
      entityId: shift.id,
      newValue: toJsonSafe({ cancelledAt: shift.cancelledAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverShiftEntity(shift);
  }

  // POST /driver/shifts/:id/breaks -- inicia uma pausa. Idempotente: se ja
  // houver uma pausa em aberto nesta jornada, devolve ela sem criar outra.
  async startBreak(
    tenantId: string,
    driverId: string,
    id: string,
    dto: StartShiftBreakDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverShiftEntity> {
    const before = await this.findOwnedOrThrow(tenantId, driverId, id);
    if (before.endedAt || before.cancelledAt) {
      throw new ConflictException('Esta jornada nao esta em aberto.');
    }
    const openBreak = before.breaks.find((b) => b.endedAt === null);
    if (openBreak) {
      return toDriverShiftEntity(before);
    }

    const shiftBreak = await this.prisma.shiftBreak.create({
      data: {
        driverShiftId: id,
        type: dto.type ?? TripStopType.REST,
        startedAt: new Date(),
        ...compact({ reason: dto.reason }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'break.started',
      entityName: 'ShiftBreak',
      entityId: shiftBreak.id,
      newValue: toJsonSafe({ driverShiftId: id, type: shiftBreak.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOwnedOrThrow(tenantId, driverId, id).then(toDriverShiftEntity);
  }

  // POST /driver/shifts/:id/breaks/end -- encerra a pausa em aberto.
  // Idempotente (sem pausa em aberto = devolve o estado atual da jornada).
  async endBreak(
    tenantId: string,
    driverId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverShiftEntity> {
    const before = await this.findOwnedOrThrow(tenantId, driverId, id);
    const openBreak = before.breaks.find((b) => b.endedAt === null);
    if (!openBreak) {
      return toDriverShiftEntity(before);
    }

    const shiftBreak = await this.prisma.shiftBreak.update({
      where: { id: openBreak.id },
      data: { endedAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'break.ended',
      entityName: 'ShiftBreak',
      entityId: shiftBreak.id,
      newValue: toJsonSafe({ driverShiftId: id, endedAt: shiftBreak.endedAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOwnedOrThrow(tenantId, driverId, id).then(toDriverShiftEntity);
  }

  // GET /driver/shifts/active -- jornada em aberto deste motorista, se houver.
  async getActive(tenantId: string, driverId: string): Promise<DriverShiftEntity | null> {
    const shift = await this.findOpenShift(tenantId, driverId);
    return shift ? toDriverShiftEntity(shift) : null;
  }

  // GET /trips/:id/shifts -- leitura administrativa, jornadas vinculadas a
  // esta viagem (tripId e opcional no schema; nunca todas as jornadas do
  // motorista, so as desta viagem).
  async findAllForTrip(tenantId: string, tripId: string): Promise<DriverShiftEntity[]> {
    await this.assertTripExists(tenantId, tripId);
    const shifts = await this.prisma.driverShift.findMany({
      where: { tenantId, tripId },
      orderBy: { startedAt: 'desc' },
      include: SHIFT_INCLUDE,
    });
    return shifts.map(toDriverShiftEntity);
  }

  private async findOpenShift(tenantId: string, driverId: string): Promise<ShiftWithBreaks | null> {
    return this.prisma.driverShift.findFirst({
      where: { tenantId, driverId, endedAt: null, cancelledAt: null },
      include: SHIFT_INCLUDE,
    });
  }

  private async assertTripExists(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, driverId: string, id: string): Promise<ShiftWithBreaks> {
    const shift = await this.prisma.driverShift.findFirst({
      where: { id, tenantId, driverId },
      include: SHIFT_INCLUDE,
    });
    if (!shift) {
      throw new NotFoundException('Jornada nao encontrada para este motorista.');
    }
    return shift;
  }
}
