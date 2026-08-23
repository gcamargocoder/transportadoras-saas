import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../../tenants/context/tenant-context';
import { FindNotificationsQueryDto } from '../dto/find-notifications-query.dto';
import { NotificationEntity, PaginatedNotificationsEntity, UnreadNotificationCountEntity } from '../entities/notification.entity';
import { NotificationsService } from '../services/notifications.service';

// Fase 69 -- Centro de Alertas e Notificacoes. Sem @Roles/RBAC por tipo:
// TODO usuario autenticado (qualquer role, inclusive DRIVER via
// DriverTripsController que reaproveita este MESMO service) so enxerga as
// PROPRIAS notificacoes (recipientId = usuario autenticado, garantido no
// proprio WHERE do service, nunca so no controller) -- nao ha necessidade
// de restringir por role aqui, o isolamento e por usuario.
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista as notificações do usuário autenticado (paginada, filtros por lida/tipo/severidade/origem/período).' })
  @ApiOkResponse({ type: PaginatedNotificationsEntity })
  findAll(@Query() query: FindNotificationsQueryDto): Promise<PaginatedNotificationsEntity> {
    return this.notificationsService.findAllForUser(
      this.tenantContext.requireTenantId(),
      this.tenantContext.requireUserId(),
      query,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contagem de notificações não lidas do usuário autenticado (total e críticas).' })
  @ApiOkResponse({ type: UnreadNotificationCountEntity })
  getUnreadCount(): Promise<UnreadNotificationCountEntity> {
    return this.notificationsService.getUnreadCount(this.tenantContext.requireTenantId(), this.tenantContext.requireUserId());
  }

  // Fase 70 -- gatilho manual, escopado ao PROPRIO tenant do chamador
  // (nunca dispara o scan global entre tenants -- esse e exclusivo do
  // NotificationsProcessingScheduler). Util para operacao ("gerar agora",
  // sem esperar o proximo tick do cron) e para testes deterministicos.
  // Idempotente (mesmo mecanismo de processTenant/createMany skipDuplicates).
  @Post('process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Fase 70 -- gera agora as notificações pendentes do tenant autenticado (mesmo processamento do job periódico, escopado a este tenant). Idempotente.',
  })
  processNow(): Promise<{ notificationsCreated: number }> {
    return this.notificationsService
      .processTenant(this.tenantContext.requireTenantId())
      .then((notificationsCreated) => ({ notificationsCreated }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma notificação do usuário autenticado.' })
  @ApiOkResponse({ type: NotificationEntity })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationEntity> {
    return this.notificationsService.findOne(this.tenantContext.requireTenantId(), this.tenantContext.requireUserId(), id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca uma notificação como lida. Idempotente.' })
  @ApiOkResponse({ type: NotificationEntity })
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    const userId = this.tenantContext.requireUserId();
    return this.notificationsService.markRead(tenantId, userId, id, { userId }, this.tenantContext.requestMetadata);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca todas as notificações não lidas do usuário autenticado como lidas. Idempotente.' })
  markAllRead(): Promise<{ count: number }> {
    const tenantId = this.tenantContext.requireTenantId();
    const userId = this.tenantContext.requireUserId();
    return this.notificationsService.markAllRead(tenantId, userId, { userId }, this.tenantContext.requestMetadata);
  }
}
