import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Radio, Volume2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatAudioTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function smoothPlaybackLevel(nextLevel, previousLevel) {
  const next = Number.isFinite(nextLevel) ? nextLevel : 0;
  const previous = Number.isFinite(previousLevel) ? previousLevel : 0;
  const riseWeight = next > previous ? 0.7 : 0.38;
  return (previous * (1 - riseWeight)) + (next * riseWeight);
}

export function AudioMessagePlayer({
  src,
  title = 'Audio do comunicado',
  durationSeconds = null,
  compact = false,
  className,
}) {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const playbackLevelsRef = useRef([]);
  const waveformSeedRef = useRef([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(Number(durationSeconds) || 0);
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const totalDuration = loadedDuration || Number(durationSeconds) || 0;
  const progressValue = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;
  const bars = useMemo(() => Array.from({ length: compact ? 16 : 22 }), [compact]);
  const [playbackLevels, setPlaybackLevels] = useState(() => bars.map(() => 0.18));

  useEffect(() => {
    const seed = bars.map((_, index) => 0.6 + Math.sin(index * 1.37) * 0.18 + ((index % 5) * 0.04));
    waveformSeedRef.current = seed;
    const idleLevels = bars.map((_, index) => {
      const previous = playbackLevelsRef.current[index] ?? 0.18;
      return smoothPlaybackLevel(0.16 + (seed[index] * 0.08), previous);
    });
    playbackLevelsRef.current = idleLevels;
    setPlaybackLevels(idleLevels);
  }, [bars]);

  const stopPlaybackVisualization = useCallback((resetToIdle = true) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (resetToIdle && playbackLevelsRef.current.length) {
      const idleLevels = bars.map((_, index) => {
        const baseSeed = waveformSeedRef.current[index] ?? 0.7;
        const previous = playbackLevelsRef.current[index] ?? 0.18;
        return smoothPlaybackLevel(0.14 + (baseSeed * 0.08), previous);
      });
      playbackLevelsRef.current = idleLevels;
      setPlaybackLevels(idleLevels);
    }
  }, [bars]);

  const startPlaybackVisualization = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isNativeAndroid) return;

    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }

      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        await context.resume();
      }

      if (!sourceNodeRef.current) {
        sourceNodeRef.current = context.createMediaElementSource(audio);
      }

      if (!analyserRef.current) {
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        analyser.minDecibels = -92;
        analyser.maxDecibels = -18;
        sourceNodeRef.current.connect(analyser);
        analyser.connect(context.destination);
        analyserRef.current = analyser;
      }

      const analyser = analyserRef.current;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      const updateLevels = () => {
        if (!audioRef.current || audioRef.current.paused) {
          stopPlaybackVisualization(true);
          return;
        }

        analyser.getByteFrequencyData(frequencyData);
        const nextLevels = bars.map((_, index) => {
          const start = Math.floor((index / bars.length) * frequencyData.length);
          const end = Math.max(start + 1, Math.floor(((index + 1) / bars.length) * frequencyData.length));
          let sum = 0;
          for (let cursor = start; cursor < end; cursor += 1) {
            sum += frequencyData[cursor] || 0;
          }

          const sliceAverage = sum / Math.max(1, end - start);
          const normalized = Math.min(1, sliceAverage / 210);
          const timePulse = Math.abs(Math.sin((audio.currentTime * 5.4) + (index * 0.55)));
          const seed = waveformSeedRef.current[index] ?? 0.7;
          const nextLevel = 0.1 + (normalized * 0.92) + (timePulse * 0.12) + (seed * 0.04);
          return smoothPlaybackLevel(Math.min(1.08, nextLevel), playbackLevelsRef.current[index] ?? 0.16);
        });

        playbackLevelsRef.current = nextLevels;
        setPlaybackLevels(nextLevels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };

      stopPlaybackVisualization(false);
      animationFrameRef.current = requestAnimationFrame(updateLevels);
    } catch {
      const fallbackLevels = bars.map((_, index) => {
        const oscillation = 0.38 + Math.abs(Math.sin((audio.currentTime * 4.2) + (index * 0.48))) * 0.62;
        return smoothPlaybackLevel(oscillation, playbackLevelsRef.current[index] ?? 0.18);
      });
      playbackLevelsRef.current = fallbackLevels;
      setPlaybackLevels(fallbackLevels);
    }
  }, [bars, isNativeAndroid, stopPlaybackVisualization]);

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
      stopPlaybackVisualization(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
      stopPlaybackVisualization(true);
    };
    const handlePlay = () => {
      setIsPlaying(true);
      void startPlaybackVisualization();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      stopPlaybackVisualization(true);
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [durationSeconds, isNativeAndroid, startPlaybackVisualization, stopPlaybackVisualization]);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setLoadedDuration(Number(durationSeconds) || 0);
    stopPlaybackVisualization(true);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [durationSeconds, src, stopPlaybackVisualization]);

  useEffect(() => () => {
    stopPlaybackVisualization(false);
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [stopPlaybackVisualization]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (audio.paused) {
      try {
        if (audio.readyState === 0) {
          audio.load();
        }
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
      <audio ref={audioRef} src={src} preload="metadata" {...(isNativeAndroid ? {} : { crossOrigin: 'anonymous' })} />

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
            {bars.map((_, index) => {
              const level = playbackLevels[index] ?? 0.18;
              const heightRem = 0.48 + (Math.min(1.12, Math.max(0.08, level)) * (compact ? 1.3 : 1.7));
              return (
              <span
                key={`${title}-${index}`}
                className={cn('audio-wave-bar', isPlaying ? 'audio-wave-bar-active' : 'audio-wave-bar-idle')}
                style={{
                  height: `${heightRem}rem`,
                  opacity: isPlaying ? Math.min(1, 0.38 + (level * 0.9)) : 0.45,
                  transform: `scaleY(${isPlaying ? 1 + (Math.min(level, 1.05) * 0.06) : 1}) translateY(${isPlaying ? `${(1 - Math.min(level, 1)) * 1.5}px` : '0px'})`,
                  borderRadius: `${Math.max(6, 16 - (level * 4))}px`,
                  transitionDelay: `${index * 16}ms`,
                }}
              />
            );
            })}
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
