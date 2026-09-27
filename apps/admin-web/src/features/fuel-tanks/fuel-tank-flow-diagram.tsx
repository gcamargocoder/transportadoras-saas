'use client';

import { ArrowLeftRight, ArrowRight, ClipboardCheck, Cylinder, Truck, Warehouse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardBody } from '../../components/ui/card';
import type { FuelTankMovementEntity } from '../../types/entities';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/format';

// Fase 5, secao 3 -- fluxo visual de entrada/saida/ajuste. Le so a ULTIMA
// movimentacao de cada tipo, ja presente na janela de movimentacoes recentes
// carregada pela aba "Visao geral" (nenhuma requisicao extra, nenhum calculo
// de saldo -- so exibicao de campos ja existentes em FuelTankMovementEntity).
function findLastByType(movements: FuelTankMovementEntity[], type: FuelTankMovementEntity['type']): FuelTankMovementEntity | undefined {
  return movements.find((m) => m.type === type);
}

function FlowStep({
  fromIcon: FromIcon,
  toIcon: ToIcon,
  title,
  children,
}: {
  fromIcon: LucideIcon;
  toIcon: LucideIcon;
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card className="flex-1">
      <CardBody>
        <div className="flex items-center gap-2 text-ink-subtle">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted">
            <FromIcon size={16} />
          </span>
          <ArrowRight size={14} />
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted">
            <ToIcon size={16} />
          </span>
        </div>
        <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
        <div className="mt-2 text-sm">{children}</div>
      </CardBody>
    </Card>
  );
}

export function FuelTankFlowDiagram({ movements }: { movements: FuelTankMovementEntity[] }): JSX.Element {
  const lastReceipt = findLastByType(movements, 'RECEIPT');
  const lastFueling = findLastByType(movements, 'INTERNAL_FUELING');
  const lastAdjustment = findLastByType(movements, 'ADJUSTMENT');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <FlowStep fromIcon={Warehouse} toIcon={Cylinder} title="Entrada -- Fornecedor → Tanque">
        {lastReceipt ? (
          <div className="flex flex-col gap-0.5 text-ink">
            <p className="font-medium">+{formatNumber(lastReceipt.quantityLiters)} L</p>
            {lastReceipt.totalAmount !== null && <p className="text-ink-muted">{formatCurrency(lastReceipt.totalAmount)}</p>}
            <p className="text-xs text-ink-subtle">{formatDateTime(lastReceipt.effectiveDate)}</p>
          </div>
        ) : (
          <p className="text-ink-subtle">Nenhuma entrada registrada.</p>
        )}
      </FlowStep>

      <FlowStep fromIcon={Cylinder} toIcon={Truck} title="Saída -- Tanque → Veículo">
        {lastFueling ? (
          <div className="flex flex-col gap-0.5 text-ink">
            <p className="font-medium">-{formatNumber(lastFueling.quantityLiters)} L</p>
            <p className="text-ink-muted">
              {lastFueling.vehiclePlate ?? 'Veículo não identificado'}
              {lastFueling.driverName && ` · ${lastFueling.driverName}`}
            </p>
            {lastFueling.tripLabel && <p className="text-xs text-ink-subtle">{lastFueling.tripLabel}</p>}
            <p className="text-xs text-ink-subtle">{formatDateTime(lastFueling.effectiveDate)}</p>
          </div>
        ) : (
          <p className="text-ink-subtle">Nenhum abastecimento interno registrado.</p>
        )}
      </FlowStep>

      <FlowStep fromIcon={ClipboardCheck} toIcon={ArrowLeftRight} title="Ajuste -- Tanque ↔ Conferência">
        {lastAdjustment ? (
          <div className="flex flex-col gap-0.5 text-ink">
            <p className="font-medium">
              {lastAdjustment.quantityLiters > 0 ? '+' : ''}
              {formatNumber(lastAdjustment.quantityLiters)} L
            </p>
            {lastAdjustment.notes && <p className="text-ink-muted">{lastAdjustment.notes}</p>}
            <p className="text-xs text-ink-subtle">{formatDateTime(lastAdjustment.effectiveDate)}</p>
          </div>
        ) : (
          <p className="text-ink-subtle">Nenhum ajuste registrado.</p>
        )}
      </FlowStep>
    </div>
  );
}
