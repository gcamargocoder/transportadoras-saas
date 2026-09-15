'use client';

import Link from 'next/link';
import { Card, CardBody } from '../../../../components/ui/card';
import { PageHeader } from '../../../../components/ui/page-header';
import { PRIMEIROS_PASSOS_STEPS } from '../../../../features/help/primeiros-passos';

export default function PrimeirosPassosPage(): JSX.Element {
  return (
    <div>
      <PageHeader
        title="Primeiros passos"
        description="A sequência geral para começar a usar o sistema."
        breadcrumb={[{ label: 'Central de Ajuda', href: '/help' }, { label: 'Primeiros passos' }]}
      />
      <Card>
        <CardBody>
          <ol className="flex flex-col gap-5">
            {PRIMEIROS_PASSOS_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{step.description}</p>
                  {step.articleSlug && (
                    <Link href={`/help/${step.articleSlug}`} className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
                      Ver artigo completo
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
