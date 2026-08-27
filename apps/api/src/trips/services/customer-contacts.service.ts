import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerContact } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerContactDto } from '../dto/create-customer-contact.dto';
import { UpdateCustomerContactDto } from '../dto/update-customer-contact.dto';
import { CustomerContactEntity } from '../entities/customer-contact.entity';
import { toCustomerContactEntity } from '../mappers/customer-contact.mapper';

// Fase 93 -- pessoas de contato do cliente (CRM). Nunca duplica Customer:
// e um relacionamento 1:N a parte, escopado por customerId + tenantId (mesmo
// desenho de TripOccurrencesService para sub-recursos de um dono).
@Injectable()
export class CustomerContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAllForCustomer(tenantId: string, customerId: string): Promise<CustomerContactEntity[]> {
    await this.assertCustomerExists(tenantId, customerId);
    const contacts = await this.prisma.customerContact.findMany({
      where: { tenantId, customerId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    return contacts.map(toCustomerContactEntity);
  }

  async create(
    tenantId: string,
    customerId: string,
    dto: CreateCustomerContactDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<CustomerContactEntity> {
    await this.assertCustomerExists(tenantId, customerId);

    const contact = await this.prisma.customerContact.create({
      data: {
        tenantId,
        customerId,
        name: dto.name,
        isPrimary: dto.isPrimary ?? false,
        ...compact({ role: dto.role, phone: dto.phone, email: dto.email, notes: dto.notes }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'customer.contact_created',
      entityName: 'CustomerContact',
      entityId: contact.id,
      newValue: toJsonSafe({ customerId, name: contact.name }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toCustomerContactEntity(contact);
  }

  async update(
    tenantId: string,
    customerId: string,
    id: string,
    dto: UpdateCustomerContactDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<CustomerContactEntity> {
    const before = await this.findOwnedOrThrow(tenantId, customerId, id);

    const contact = await this.prisma.customerContact.update({
      where: { id: before.id },
      data: compact({
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        isPrimary: dto.isPrimary,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'customer.contact_updated',
      entityName: 'CustomerContact',
      entityId: contact.id,
      newValue: toJsonSafe(dto),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toCustomerContactEntity(contact);
  }

  async remove(
    tenantId: string,
    customerId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, customerId, id);

    await this.prisma.customerContact.delete({ where: { id: before.id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'customer.contact_deleted',
      entityName: 'CustomerContact',
      entityId: before.id,
      newValue: toJsonSafe({ customerId }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente nao encontrado nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, customerId: string, id: string): Promise<CustomerContact> {
    const contact = await this.prisma.customerContact.findFirst({ where: { id, tenantId, customerId } });
    if (!contact) {
      throw new NotFoundException('Contato nao encontrado para este cliente.');
    }
    return contact;
  }
}
