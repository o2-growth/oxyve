import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Rótulo mono da seção (eyebrow). Se omitido, deriva do title. */
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  const eyebrowLabel = eyebrow ?? title;

  return (
    <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <p className="o2-eyebrow truncate">{eyebrowLabel}</p>
        <h1 className="o2-display text-2xl md:text-3xl text-foreground mt-1 truncate">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm sm:text-base text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
