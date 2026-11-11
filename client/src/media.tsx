import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Mic, MicOff, X } from 'lucide-react';
import type { Photo } from '../../shared/types';
import { MAX_PHOTO_CHARS } from '../../shared/types';

// Re-encoding through a canvas downsizes the upload and drops EXIF data such as GPS location.
async function compress(file: File): Promise<Photo> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('이 사진 형식은 읽을 수 없어요. JPG나 PNG 사진을 선택해 주세요.');
  }
  for (const [side, quality] of [
    [1600, 0.82],
    [1200, 0.72],
    [900, 0.6],
  ]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1] || '';
    if (data && data.length <= MAX_PHOTO_CHARS) {
      bitmap.close();
      return { mimeType: 'image/jpeg', data };
    }
  }
  bitmap.close();
  throw new Error('사진이 너무 커서 줄이지 못했어요. 다른 사진을 선택해 주세요.');
}

export function PhotoPicker({
  photos,
  onChange,
  remaining,
  disabled,
  onError,
}: {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  remaining: number;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [reading, setReading] = useState(false);
  const left = remaining - photos.length;
  async function add(files: FileList | null) {
    if (!files?.length) return;
    const picked = [...files];
    if (picked.length > left) onError(`사진은 ${left}장만 더 첨부할 수 있어요.`);
    setReading(true);
    try {
      const added: Photo[] = [];
      for (const file of picked.slice(0, left)) added.push(await compress(file));
      onChange([...photos, ...added]);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setReading(false);
    }
  }
  if (remaining <= 0) return null;
  return (
    <div className="photo-picker">
      {photos.map((p, i) => (
        <div key={i} className="photo-thumb">
          <img src={`data:${p.mimeType};base64,${p.data}`} alt={`첨부한 사진 ${i + 1}`} />
          <button
            type="button"
            aria-label={`사진 ${i + 1} 삭제`}
            disabled={disabled}
            onClick={() => onChange(photos.filter((_, j) => j !== i))}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      {left > 0 && (
        <label className={`tool-button ${disabled || reading ? 'disabled' : ''}`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={disabled || reading}
            aria-label="사진 증거 첨부"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
          <ImagePlus size={14} /> {reading ? '사진 준비 중…' : `사진 증거 (${left}장 남음)`}
        </label>
      )}
    </div>
  );
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionClass = new () => Recognition;
const Recognizer = globalThis as unknown as {
  SpeechRecognition?: RecognitionClass;
  webkitSpeechRecognition?: RecognitionClass;
};
const SpeechRecognitionAPI = Recognizer.SpeechRecognition || Recognizer.webkitSpeechRecognition;

export function MicButton({
  onText,
  onError,
  onStart,
  listenSignal = 0,
  disabled,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onStart?: () => void;
  /** Increment to start listening without a click, e.g. after the judge asks aloud. */
  listenSignal?: number;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const handlers = useRef({ onText, onError, onStart });
  handlers.current = { onText, onError, onStart };
  const start = useCallback(() => {
    if (!SpeechRecognitionAPI || recognition.current) return;
    const r = new SpeechRecognitionAPI();
    r.lang = 'ko-KR';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const text = result[0]?.transcript.trim();
        if (result.isFinal && text) handlers.current.onText(text);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        handlers.current.onError(
          '마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요.',
        );
      else if (e.error !== 'no-speech' && e.error !== 'aborted')
        handlers.current.onError('음성을 인식하지 못했어요. 다시 시도하거나 직접 입력해 주세요.');
    };
    r.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = r;
    try {
      // Stop any narration first so the court's own voice is not transcribed.
      handlers.current.onStart?.();
      r.start();
      setListening(true);
    } catch {
      recognition.current = null;
      handlers.current.onError('음성 입력을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, []);
  useEffect(() => () => recognition.current?.stop(), []);
  useEffect(() => {
    if (disabled) recognition.current?.stop();
  }, [disabled]);
  useEffect(() => {
    if (listenSignal > 0 && !disabled) start();
    // Only a new signal starts listening; re-enabling the button must not.
  }, [listenSignal]);
  if (!SpeechRecognitionAPI) return null;
  function toggle() {
    if (listening) recognition.current?.stop();
    else start();
  }
  return (
    <button
      type="button"
      className={`tool-button ${listening ? 'listening' : ''}`}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      title="말한 내용을 글자로 바꿔 입력해요. 브라우저의 음성 인식 서비스를 사용합니다."
    >
      {listening ? <MicOff size={14} /> : <Mic size={14} />}
      {listening ? '듣는 중… 누르면 멈춤' : '음성 입력'}
    </button>
  );
}

export const appendText = (value: string, text: string, max: number) =>
  ((value.trim() ? `${value.trimEnd()} ` : '') + text).slice(0, max);
