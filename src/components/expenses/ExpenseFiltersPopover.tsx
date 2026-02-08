import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Filter, X } from 'lucide-react';
import { useCategories, useCostCenters, useProjects } from '@/hooks/useExpenses';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

export interface AdvancedFilters {
  categoryId?: string;
  paymentMethod?: string;
  isReimbursable?: boolean | null;
  costCenterId?: string;
  projectId?: string;
}

interface ExpenseFiltersPopoverProps {
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
  activeCount: number;
}

export function ExpenseFiltersPopover({
  filters,
  onChange,
  activeCount,
}: ExpenseFiltersPopoverProps) {
  const [open, setOpen] = useState(false);
  const { data: categories } = useCategories();
  const { data: costCenters } = useCostCenters();
  const { data: projects } = useProjects();

  const handleClear = () => {
    onChange({
      categoryId: undefined,
      paymentMethod: undefined,
      isReimbursable: null,
      costCenterId: undefined,
      projectId: undefined,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Mais filtros
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filtros avançados</h4>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-auto p-1 text-muted-foreground"
              >
                <X className="mr-1 h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={filters.categoryId || 'all'}
                onValueChange={(v) =>
                  onChange({ ...filters, categoryId: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select
                value={filters.paymentMethod || 'all'}
                onValueChange={(v) =>
                  onChange({ ...filters, paymentMethod: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cost Center */}
            {costCenters && costCenters.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Centro de custo</Label>
                <Select
                  value={filters.costCenterId || 'all'}
                  onValueChange={(v) =>
                    onChange({ ...filters, costCenterId: v === 'all' ? undefined : v })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.code ? `${cc.code} - ${cc.name}` : cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Project */}
            {projects && projects.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Projeto</Label>
                <Select
                  value={filters.projectId || 'all'}
                  onValueChange={(v) =>
                    onChange({ ...filters, projectId: v === 'all' ? undefined : v })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {projects.map((proj) => (
                      <SelectItem key={proj.id} value={proj.id}>
                        {proj.code ? `${proj.code} - ${proj.name}` : proj.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Reimbursable */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reembolsável</Label>
              <Select
                value={
                  filters.isReimbursable === true
                    ? 'yes'
                    : filters.isReimbursable === false
                    ? 'no'
                    : 'all'
                }
                onValueChange={(v) =>
                  onChange({
                    ...filters,
                    isReimbursable: v === 'all' ? null : v === 'yes',
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
