import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerNoteDto } from '../dto/create-customer-note.dto';
import { CustomerNoteEntity } from '../entities/customer-note.entity';
import { toCustomerNoteEntity } from '../mappers/customer-note.mapper';

// Fase 93 -- observacoes/interacoes comerciais. Append-only (sem update):
// um log de interacoes so faz sentido como historico, editar um registro
// passado distorceria o que realmente foi dito/feito.
@Injectable()
export class CustomerNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAllForCustomer(tenantId: string, customerId: string): Promise<CustomerNoteEntity[]> {
    await this.assertCustomerExists(tenantId, customerId);
    const notes = await this.prisma.customerNote.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map(toCustomerNoteEntity);
  }

  async create(
    tenantId: string,
    customerId: string,
    dto: CreateCustomerNoteDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<CustomerNoteEntity> {
    await this.assertCustomerExists(tenantId, customerId);

    const note = await this.prisma.customerNote.create({
      data: { tenantId, customerId, content: dto.content, createdBy: actor.userId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'customer.note_created',
      entityName: 'CustomerNote',
      entityId: note.id,
      newValue: toJsonSafe({ customerId }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toCustomerNoteEntity(note);
  }

  private async assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente nao encontrado nesta empresa.');
    }
  }
}
