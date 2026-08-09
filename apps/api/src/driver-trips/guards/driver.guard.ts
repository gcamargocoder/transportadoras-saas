import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverRequest } from '../interfaces/driver-request.interface';

// Guard proprio da API do motorista (Fase 25) -- roda DEPOIS de
// JwtAuthGuard/RolesGuard/TenantGuard (globais). Resolve o Driver vinculado
// ao UserAccount autenticado (Driver.userAccountId, ja existente desde a
// gestao de motoristas) e anexa em `request.driver`. Um UserAccount com role
// DRIVER mas SEM motorista vinculado nunca acessa nada aqui -- a ligacao e
// sempre validada no backend, nunca confiada no token/app.
@Injectable()
export class DriverGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DriverRequest>();
    const tenantId = request.tenant?.id;
    const userId = request.user?.sub;

    if (!tenantId || !userId) {
      throw new ForbiddenException('Usuario nao autenticado.');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { userAccountId: userId, tenantId, deletedAt: null },
    });
    if (!driver || !driver.isActive) {
      throw new ForbiddenException('Este usuario nao possui um perfil de motorista vinculado.');
    }

    request.driver = driver;
    return true;
  }
}
