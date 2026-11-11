import { CourtPortrait as Person, type PortraitProps as Props } from './Portrait';

export const Judge = (props: Props) => <Person role="judge" {...props} />;
export const Prosecutor = (props: Props) => <Person role="prosecutor" {...props} />;
export const Defender = (props: Props) => <Person role="defender" {...props} />;

export function CourtScene({
  compact = false,
  active = 'judge',
  mode = 'plaintiff',
}: {
  compact?: boolean;
  active?: string;
  mode?: 'plaintiff' | 'judge';
}) {
  return (
    <div
      className={`court-scene ${compact ? 'compact' : ''}`}
      aria-label="판사, 검사, 변호사가 함께하는 가상 법정"
    >
      <div className="arch arch-one" />
      <div className="arch arch-two" />
      <div className="court-motto">사소한 일에도, 공정하게.</div>
      <svg className="wall-scales" viewBox="0 0 80 65" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M40 4v53M17 16h46M25 58h30M21 16 8 39h26zm38 0L46 39h26z" />
          <path d="M8 39q13 15 26 0m12 0q13 15 26 0" />
        </g>
      </svg>
      <div className={`seat seat-judge ${active === 'judge' ? 'speaking' : ''}`}>
        <Judge expression={active === 'judge' ? 'speaking' : 'neutral'} />
        <span>
          판사 <i>{mode === 'judge' ? 'YOU' : 'AI'}</i>
        </span>
        <div className="bench" />
      </div>
      <div
        className={`seat seat-prosecutor ${active === 'prosecutor' || active === 'plaintiff' ? 'speaking' : ''}`}
      >
        <Prosecutor expression={active === 'prosecutor' ? 'serious' : 'neutral'} />
        <span>
          {mode === 'judge' ? '원고' : '검사'} <i>AI</i>
        </span>
        <div className="bench" />
      </div>
      <div
        className={`seat seat-defender ${active === 'defender' || active === 'defendant' ? 'speaking' : ''}`}
      >
        <Defender expression={active === 'defender' ? 'speaking' : 'neutral'} />
        <span>
          {mode === 'judge' ? '피고' : '변호사'} <i>AI</i>
        </span>
        <div className="bench" />
      </div>
      {!compact && (
        <>
          <div className="scene-note note-left">이의 있습니다!</div>
          <div className="scene-note note-right">그 마음, 이해합니다.</div>
          <div className="scene-caption">
            <span /> 오늘도 평화로운 일상을 위하여
          </div>
        </>
      )}
    </div>
  );
}
