import { describe, it, expect } from 'vitest';
import { formatBytes, getFileExtension, formatRelativeTime } from '@/components/community/ChannelUI';

describe('community ChannelUI helpers', () => {
  it('formats file extensions from names', () => {
    expect(getFileExtension('plano de aula.pdf')).toBe('pdf');
    expect(getFileExtension('sem_extensao')).toBe('');
  });

  it('formats bytes for attachment chips', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('formats relative timestamps for feed headers', () => {
    const recent = new Date(Date.now() - 30 * 1000).toISOString();
    expect(formatRelativeTime(recent)).toBe('agora');
    expect(formatRelativeTime(null)).toBe('');
  });
});
