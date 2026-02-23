import { useEffect, useState } from 'react';
import { Contrast, Type, BrainCircuit, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AccessibilityLogoIcon } from '@/components/accessibility/AccessibilityLogoIcon';

const STORAGE_KEY = 'bibliotecai:a11y-prefs';

const defaultPrefs = {
  largeText: false,
  highContrast: false,
  dyslexiaFont: false,
  reduceMotion: false,
};

function applyPrefs(prefs) {
  const root = document.documentElement;

  root.classList.toggle('a11y-large-text', prefs.largeText);
  root.classList.toggle('a11y-high-contrast', prefs.highContrast);
  root.classList.toggle('a11y-dyslexia-font', prefs.dyslexiaFont);
  root.classList.toggle('a11y-reduce-motion', prefs.reduceMotion);
}

export function AccessibilityControls() {
  const [prefs, setPrefs] = useState(defaultPrefs);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const merged = { ...defaultPrefs, ...(parsed || {}) };
      setPrefs(merged);
      applyPrefs(merged);
    } catch {
      // ignore invalid local data
    }
  }, []);

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    applyPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore localStorage failures
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label="Abrir ajustes de acessibilidade">
          <AccessibilityLogoIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Acessibilidade</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <p className="font-semibold">Ajustes de Acessibilidade</p>
            <p className="text-xs text-muted-foreground">Preferências salvas só neste navegador e usuário.</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="a11y-large-text" className="flex items-center gap-2 text-sm"><Type className="h-4 w-4" /> Texto maior</Label>
              <Switch id="a11y-large-text" checked={prefs.largeText} onCheckedChange={(value) => updatePref('largeText', value)} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="a11y-high-contrast" className="flex items-center gap-2 text-sm"><Contrast className="h-4 w-4" /> Alto contraste</Label>
              <Switch id="a11y-high-contrast" checked={prefs.highContrast} onCheckedChange={(value) => updatePref('highContrast', value)} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="a11y-dyslexia-font" className="flex items-center gap-2 text-sm"><BrainCircuit className="h-4 w-4" /> Fonte amigável (dislexia)</Label>
              <Switch id="a11y-dyslexia-font" checked={prefs.dyslexiaFont} onCheckedChange={(value) => updatePref('dyslexiaFont', value)} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="a11y-reduce-motion" className="flex items-center gap-2 text-sm"><Waves className="h-4 w-4" /> Reduzir movimentos</Label>
              <Switch id="a11y-reduce-motion" checked={prefs.reduceMotion} onCheckedChange={(value) => updatePref('reduceMotion', value)} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
