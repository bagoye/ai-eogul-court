export interface VoiceLike {
  name: string;
  lang: string;
}
export type Role = 'judge' | 'prosecutor' | 'defender' | 'plaintiff' | 'defendant';

// macOS ships these as Korean voices, but they are English-engine voices with a foreign accent.
const ACCENTED = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
const MALE = /InJoon|Hyunsu|BongJin|GookMin|Minsu/i;

export function scoreVoice(v: VoiceLike) {
  if (!/^ko([-_]|$)/i.test(v.lang)) return -Infinity;
  if (ACCENTED.test(v.name)) return -5;
  let score = 1;
  if (/natural|neural|online/i.test(v.name)) score += 4;
  if (/premium|프리미엄/i.test(v.name)) score += 3;
  if (/enhanced|향상/i.test(v.name)) score += 2;
  if (/Yuna|유나|SunHi|InJoon|Hyunsu|Google|Heami|Sora/i.test(v.name)) score += 2;
  return score;
}

/** Picks the most natural Korean voice per role; accented voices only when nothing else exists. */
export function castVoices<T extends VoiceLike>(voices: T[]): Partial<Record<Role, T>> {
  const korean = voices
    .filter((v) => scoreVoice(v) > -Infinity)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
  const natural = korean.filter((v) => scoreVoice(v) > 0);
  const best = natural[0] || korean[0];
  if (!best) return {};
  const male = natural.find((v) => MALE.test(v.name));
  const female = natural.find((v) => !MALE.test(v.name));
  const judge = male || best;
  const prosecutor = female || best;
  const defender = natural.find((v) => v !== judge && v !== prosecutor) || prosecutor;
  return { judge, prosecutor, defender, plaintiff: prosecutor, defendant: defender };
}

// Small offsets only: large pitch shifts make synthetic voices sound unnatural.
export const STYLE: Record<Role, { pitch: number; rate: number }> = {
  judge: { pitch: 0.95, rate: 0.95 },
  prosecutor: { pitch: 1.0, rate: 1.05 },
  defender: { pitch: 1.05, rate: 1.0 },
  plaintiff: { pitch: 1.03, rate: 1.03 },
  defendant: { pitch: 0.98, rate: 1.0 },
};
