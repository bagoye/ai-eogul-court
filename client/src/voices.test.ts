import { describe, it, expect } from 'vitest';
import { castVoices, scoreVoice } from './voices';

const voice = (name: string, lang = 'ko-KR') => ({ name, lang });
const mac = [
  voice('Eddy (한국어(한국))'),
  voice('Flo (한국어(한국))'),
  voice('Grandma (한국어(한국))'),
  voice('Samantha', 'en-US'),
  voice('Yuna'),
];
describe('Korean voice casting', () => {
  it('never picks accented English-engine voices when a native Korean voice exists', () => {
    const cast = castVoices(mac);
    expect(Object.values(cast).map((v) => v!.name)).toEqual(Array(5).fill('Yuna'));
  });
  it('prefers natural voices and casts a male judge when one is available', () => {
    const cast = castVoices([
      voice('Microsoft SunHi Online (Natural) - Korean (Korea)'),
      voice('Microsoft InJoon Online (Natural) - Korean (Korea)'),
      voice('Google 한국의'),
      voice('Microsoft Heami - Korean (Korean)'),
    ]);
    expect(cast.judge!.name).toContain('InJoon');
    expect(cast.prosecutor!.name).toContain('SunHi');
    expect(cast.defender!.name).toBe('Google 한국의');
  });
  it('falls back to an accented Korean voice rather than an English one', () => {
    expect(castVoices([voice('Eddy (한국어(한국))'), voice('Samantha', 'en-US')]).judge!.name).toBe(
      'Eddy (한국어(한국))',
    );
    expect(castVoices([voice('Samantha', 'en-US')])).toEqual({});
    expect(scoreVoice(voice('Yuna', 'ko_KR'))).toBeGreaterThan(0);
  });
});
