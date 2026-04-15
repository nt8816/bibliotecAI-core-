import {
  canPerformRealWrites,
  getAppEnvironmentLabel,
  getEnvironmentBannerVariant,
  isPointingToLikelyProductionServices,
  isProtectedNonProductionEnvironment,
} from '@/lib/appEnvironment';

const variantClasses = {
  production: 'border-amber-300/70 bg-amber-50 text-amber-950',
  protected: 'border-sky-300/70 bg-sky-50 text-sky-950',
  default: 'border-emerald-300/70 bg-emerald-50 text-emerald-950',
};

export function EnvironmentBanner() {
  const variant = getEnvironmentBannerVariant();
  const bannerClassName = variantClasses[variant] || variantClasses.default;

  const writeStatus = canPerformRealWrites() ? 'escrita liberada' : 'somente leitura';
  const serviceHint = isProtectedNonProductionEnvironment() && isPointingToLikelyProductionServices()
    ? ' Endpoints de producao detectados: mutacoes ficam travadas por seguranca.'
    : '';

  return (
    <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm ${bannerClassName}`}>
      Ambiente: {getAppEnvironmentLabel()} | Modo: {writeStatus}.{serviceHint}
    </div>
  );
}
