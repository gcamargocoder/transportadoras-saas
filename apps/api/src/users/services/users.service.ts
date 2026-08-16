import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserAccount } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { hashPassword } from '../../auth/utils/password.util';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import { assertUnderLimit, runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserEntity } from '../entities/user.entity';
import { toUserEntity } from '../mappers/user.mapper';

// Isolamento multi-tenant: TODO metodo aqui recebe tenantId explicitamente
// e SEMPRE o inclui no where de toda query -- nunca busca UserAccount so
// por id. Isso garante que um id valido de OUTRO tenant nunca e encontrado
// (retorna 404, nao vaza a existencia do registro).
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string): Promise<UserEntity[]> {
    const users = await this.prisma.userAccount.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toUserEntity);
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<UserEntity> {
    // Hash fora da transacao serializavel -- bcrypt e lento, e a transacao
    // deve ficar curta para minimizar chance de conflito de serializacao
    // com outra criacao concorrente no mesmo tenant.
    const passwordHash = await hashPassword(dto.password);

    // Fase 48 -- checagem de duplicidade + limite do plano + create numa
    // unica transacao Serializable: garante que duas criacoes concorrentes
    // nunca ultrapassem juntas o limite de usuarios do tenant.
    const user = await runSerializable(this.prisma, async (tx) => {
      const existing = await tx.userAccount.findUnique({
        where: { tenantId_email: { tenantId, email: dto.email } },
      });
      if (existing) {
        throw new ConflictException('Ja existe um usuario com este e-mail nesta empresa.');
      }

      const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
      const count = await tx.userAccount.count({ where: { tenantId, deletedAt: null } });
      assertUnderLimit(count, plan?.maxUsers, PLAN_ERRORS.USER_LIMIT_REACHED);

      return tx.userAccount.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: dto.role,
          isActive: true,
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'user.created',
      entityName: 'UserAccount',
      entityId: user.id,
      newValue: toJsonSafe({ name: user.name, email: user.email, role: user.role }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toUserEntity(user);
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateUserDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<UserEntity> {
    const before = await this.findActiveOrThrow(tenantId, userId);

    if (dto.email && dto.email !== before.email) {
      const existing = await this.prisma.userAccount.findUnique({
        where: { tenantId_email: { tenantId, email: dto.email } },
      });
      if (existing) {
        throw new ConflictException('Ja existe um usuario com este e-mail nesta empresa.');
      }
    }

    const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;

    const user = await this.prisma.userAccount.update({
      where: { id: userId },
      data: compact({ name: dto.name, email: dto.email, role: dto.role, passwordHash }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: dto.password ? 'user.updated_with_password_reset' : 'user.updated',
      entityName: 'UserAccount',
      entityId: user.id,
      previousValue: toJsonSafe({ name: before.name, email: before.email, role: before.role }),
      newValue: toJsonSafe({ name: user.name, email: user.email, role: user.role }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toUserEntity(user);
  }

  async updateStatus(
    tenantId: string,
    userId: string,
    dto: UpdateUserStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<UserEntity> {
    const before = await this.findActiveOrThrow(tenantId, userId);

    const user = await this.prisma.userAccount.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'user.status_changed',
      entityName: 'UserAccount',
      entityId: userId,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: user.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toUserEntity(user);
  }

  async softDelete(
    tenantId: string,
    userId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findActiveOrThrow(tenantId, userId);

    await this.prisma.userAccount.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'user.deleted',
      entityName: 'UserAccount',
      entityId: userId,
      previousValue: toJsonSafe({
        name: before.name,
        email: before.email,
        isActive: before.isActive,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async findActiveOrThrow(tenantId: string, userId: string): Promise<UserAccount> {
    const user = await this.prisma.userAccount.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }
    return user;
  }
}
