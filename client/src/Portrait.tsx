export type Expression = 'neutral' | 'speaking' | 'serious' | 'verdict';
export interface PortraitProps {
  expression?: Expression;
  className?: string;
}

export function CourtPortrait({
  role,
  expression = 'neutral',
  className,
}: PortraitProps & { role: 'judge' | 'prosecutor' | 'defender' }) {
  const judge = role === 'judge';
  const defender = role === 'defender';
  const dark = '#30353d';
  const skin = '#efd0b7';
  const jacket = judge ? '#30353d' : defender ? '#99877b' : '#455b70';
  return (
    <svg
      className={className}
      viewBox="0 0 220 250"
      role="img"
      aria-label={judge ? 'AI 판사' : defender ? 'AI 변호사' : 'AI 검사'}
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {defender && <path d="M65 69c0-29 18-46 45-46s45 17 45 46v64H65Z" fill={dark} />}

        {/* Simple, balanced silhouettes stay clear at small sizes. */}
        <path d="M94 129h32l28 11c17 7 27 22 29 41l6 68H31l6-68c2-19 12-34 29-41Z" fill={jacket} />
        <path d="M96 109h28v31l-14 12-14-12Z" fill={skin} />
        <path d="m93 134 17 17 17-17 11 115H82Z" fill="#faf7ef" />

        {judge ? (
          <>
            <path d="m91 130 19 21-14 24-10-34Zm38 0-19 21 14 24 10-34Z" fill="#faf7ef" />
            <path d="m105 154-5 39h20l-5-39" fill="#f0e9da" />
            <path d="m72 147-7 77m83-77 7 77" stroke="#515760" strokeWidth="2" />
          </>
        ) : (
          <>
            <path
              d="m92 131-15 12 10 26-9 8 27 56-8-77Zm36 0 15 12-10 26 9 8-27 56 8-77Z"
              fill={defender ? '#b2a094' : '#60778b'}
            />
            <path d="m96 134 14 17-12 10-9-18m35-9-14 17 12 10 9-18" fill="#fffdf6" />
            {!defender && (
              <path d="m105 151 10 0 3 8-5 8 7 38-10 12-10-12 7-38-5-8Z" fill="#a87971" />
            )}
          </>
        )}

        {!defender && (
          <>
            <ellipse cx="73" cy="82" rx="6" ry="9" fill={skin} />
            <ellipse cx="147" cy="82" rx="6" ry="9" fill={skin} />
          </>
        )}
        <path
          d="M74 65c0-24 14-36 36-36s36 12 36 36v22c0 22-15 38-36 38S74 109 74 87Z"
          fill={skin}
        />

        {defender ? (
          <path
            d="M69 78V63c0-26 17-40 41-40s41 14 41 40v52h-10V67c-14-1-27-9-34-20-6 14-18 22-29 24v44h-9Z"
            fill={dark}
          />
        ) : judge ? (
          <>
            <path
              d="M69 78V59c0-24 18-38 41-38s41 14 41 38v19h-9V59c-21 6-40 3-56-6l-8 25Z"
              fill={dark}
            />
            <path d="M71 62h7v21h-7m71-21h7v21h-7" fill="#929796" />
          </>
        ) : (
          <path
            d="M69 79V59c0-25 18-39 43-39 17 0 29 7 35 20 5 11 5 23 3 39h-9V60c-13 0-26-6-34-15-7 11-18 17-29 17v17Z"
            fill={dark}
          />
        )}

        <path
          d={expression === 'serious' ? 'm87 73 12 2m22 0 12-2' : 'M87 73h12m22 0h12'}
          fill="none"
          stroke={dark}
          strokeWidth="2"
        />
        <ellipse cx="94" cy="84" rx="2" ry="2.8" fill={dark} />
        <ellipse cx="126" cy="84" rx="2" ry="2.8" fill={dark} />
        <path d="M110 87v9h4" fill="none" stroke="#be9b83" strokeWidth="1.6" />
        <path
          d={expression === 'serious' ? 'M104 106h12' : 'M103 104q7 7 14 0'}
          fill="none"
          stroke={dark}
          strokeWidth="1.8"
        />
        {judge && (
          <g fill="none" stroke="#5b635f" strokeWidth="1.8">
            <rect x="81" y="77" width="24" height="18" rx="6" />
            <rect x="115" y="77" width="24" height="18" rx="6" />
            <path d="M105 83h10m-39-3h5m58 0h5" />
          </g>
        )}

        <path
          d="M55 183v37l39 3m71-40v37l-39 3"
          fill="none"
          stroke={judge ? '#515760' : defender ? '#837166' : '#344c61'}
          strokeWidth="2"
        />
        <path d="M94 217h32v13H94Z" fill={skin} />
        {expression === 'verdict' && (
          <g transform="translate(154 179) rotate(-25)">
            <path d="M0 5v39" stroke="#a68561" strokeWidth="5" />
            <rect x="-14" y="-4" width="28" height="15" rx="3" fill="#896c4e" />
          </g>
        )}
      </g>
    </svg>
  );
}
