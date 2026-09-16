import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import {
  CreatePreapprovalInput,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from './mercado-pago-provider.interface';

const BASE_URL = 'https://api.mercadopago.com';

// Implementacao real de MercadoPagoProviderPort via fetch nativo do Node
// (disponivel desde o Node 18) -- mesmo padrao de GoogleRoutingProvider,
// nenhuma dependencia de SDK adicionada so para chamadas REST simples.
// Nunca loga o access token.
@Injectable()
export class MercadoPagoHttpProvider implements MercadoPagoProviderPort {
  private readonly logger = new Logger(MercadoPagoHttpProvider.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get('mercadoPago', { infer: true }).accessToken);
  }

  async createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    const body = {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: input.frequency,
        frequency_type: input.frequencyType,
        transaction_amount: input.transactionAmount,
        currency_id: 'BRL',
        start_date: input.startDate.toISOString(),
      },
    };
    const json = await this.request('POST', '/preapproval', body);
    return this.toPreapproval(json);
  }

  async getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    const json = await this.request('GET', `/preapproval/${encodeURIComponent(id)}`);
    return this.toPreapproval(json);
  }

  async getPayment(id: string): Promise<MercadoPagoPayment> {
    const json = await this.request('GET', `/v1/payments/${encodeURIComponent(id)}`);
    return {
      id: String(json.id),
      status: String(json.status),
      externalReference: (json.external_reference as string | null) ?? null,
      transactionAmount: Number(json.transaction_amount),
    };
  }

  private toPreapproval(json: Record<string, unknown>): MercadoPagoPreapproval {
    return {
      id: String(json.id),
      status: String(json.status),
      payerId: json.payer_id != null ? String(json.payer_id) : null,
      externalReference: (json.external_reference as string | null) ?? null,
      initPoint: (json.init_point as string | null) ?? null,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const mercadoPagoConfig = this.configService.get('mercadoPago', { infer: true });
    const accessToken = mercadoPagoConfig.accessToken;
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Provider Mercado Pago nao configurado (MERCADO_PAGO_ACCESS_TOKEN ausente).',
      );
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), mercadoPagoConfig.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error(
        `Falha de rede ao chamar Mercado Pago (${path}): ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException('Nao foi possivel contatar o Mercado Pago.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      // Nunca repassa o corpo bruto do erro do Mercado Pago ao cliente (pode
      // conter detalhes de configuracao) -- so loga internamente.
      this.logger.error(`Mercado Pago respondeu ${response.status} em ${path}: ${JSON.stringify(json)}`);
      throw new ServiceUnavailableException('O Mercado Pago retornou um erro ao processar a solicitacao.');
    }

    if (!json) {
      throw new ServiceUnavailableException('Resposta invalida do Mercado Pago.');
    }

    return json;
  }
}
