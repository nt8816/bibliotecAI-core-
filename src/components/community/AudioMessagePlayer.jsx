import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Radio, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatAudioTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function AudioMessagePlayer({
  src,
  title = 'Audio do comunicado',
  durationSeconds = null,
  compact = false,
  className,
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(Number(durationSeconds) || 0);

  const totalDuration = loadedDuration || Number(durationSeconds) || 0;
  const progressValue = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;
  const bars = useMemo(() => Array.from({ length: compact ? 16 : 22 }), [compact]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleLoadedMetadata = () => {
      setLoadedDuration(audio.duration || Number(durationSeconds) || 0);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [durationSeconds]);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setLoadedDuration(Number(durationSeconds) || 0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [durationSeconds, src]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  const handleSeek = (event) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration) return;
    const nextProgress = Number(event.target.value) || 0;
    const nextTime = (nextProgress / 100) * totalDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div
      className={cn(
        'rounded-[28px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(15,118,110,0.08),rgba(34,197,94,0.1),rgba(255,255,255,0.96))] p-4 shadow-[0_16px_40px_rgba(16,185,129,0.12)] backdrop-blur-sm',
        compact && 'rounded-[24px] p-3',
        className,
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          className={cn(
            'h-12 w-12 rounded-full bg-emerald-600 text-white shadow-[0_10px_26px_rgba(5,150,105,0.28)] transition-transform duration-300 hover:scale-[1.03] hover:bg-emerald-500',
            compact && 'h-10 w-10',
          )}
          onClick={togglePlayback}
          disabled={!src}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </Button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-emerald-700/80">
                <Radio className={cn('h-3.5 w-3.5', isPlaying && 'animate-pulse')} />
                {isPlaying ? 'Reproduzindo' : 'Toque para ouvir'}
              </div>
            </div>
            <div className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
              {formatAudioTime(totalDuration || currentTime)}
            </div>
          </div>

          <div className="flex items-end gap-1 overflow-hidden rounded-full bg-white/70 px-3 py-2">
            {bars.map((_, index) => (
              <span
                key={`${title}-${index}`}
                className={cn('audio-wave-bar', isPlaying ? 'audio-wave-bar-active' : 'audio-wave-bar-idle')}
                style={{ animationDelay: `${index * 0.08}s` }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-emerald-700" />
            <div className="relative flex-1">
              <div className="h-2 rounded-full bg-emerald-100" />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#10b981,#34d399)] transition-all duration-200"
                style={{ width: `${progressValue}%` }}
              />
              <input
                type="range"
                min="0"
                max="100"
                value={progressValue}
                onChange={handleSeek}
                className="absolute inset-0 h-2 w-full cursor-pointer opacity-0"
                aria-label={`Controlar audio: ${title}`}
              />
            </div>
            <span className="w-11 text-right text-xs text-slate-500">{formatAudioTime(currentTime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AudioMessagePlayer;
