import { useMemo, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export function ExportPeriodDialog({
  open,
  onOpenChange,
  title = 'Exportar dados',
  description = 'Escolha se deseja exportar tudo ou apenas um período específico.',
  loading = false,
  onConfirm,
}) {
  const [mode, setMode] = useState('total');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const canConfirm = useMemo(() => {
    if (mode === 'total') return true;
    if (!startDate || !endDate) return false;
    return startDate <= endDate;
  }, [endDate, mode, startDate]);

  const handleClose = (nextOpen) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setMode('total');
      setStartDate('');
      setEndDate('');
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm || !onConfirm) return;

    await onConfirm({
      mode,
      startDate: mode === 'period' ? startDate : null,
      endDate: mode === 'period' ? endDate : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/45 backdrop-blur-sm" />
        <DialogContent className="max-w-lg border-primary/20 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-lg border px-4 py-3 text-left transition ${mode === 'total' ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}
                onClick={() => setMode('total')}
              >
                <p className="font-medium">Período total</p>
                <p className="text-sm text-muted-foreground">Exporta todos os registros.</p>
              </button>
              <button
                type="button"
                className={`rounded-lg border px-4 py-3 text-left transition ${mode === 'period' ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}
                onClick={() => setMode('period')}
              >
                <p className="font-medium">Período específico</p>
                <p className="text-sm text-muted-foreground">Defina início e fim.</p>
              </button>
            </div>

            {mode === 'period' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-1">
                  <Label htmlFor="export-start-date">Data inicial</Label>
                  <Input id="export-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="export-end-date">Data final</Label>
                  <Input id="export-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={!canConfirm || loading}>
              {loading ? 'Exportando...' : 'Exportar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
