import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TagProviderEntity } from '../entities/tag-provider.entity';
import { toTagProviderEntity } from '../mappers/vehicle-tag.mapper';

// TagProvider e dado de referencia GLOBAL (sem tenantId) -- nao ha
// isolamento multi-tenant a aplicar aqui, so autenticacao.
@Injectable()
export class TagProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<TagProviderEntity[]> {
    const providers = await this.prisma.tagProvider.findMany({ orderBy: { name: 'asc' } });
    return providers.map(toTagProviderEntity);
  }
}
