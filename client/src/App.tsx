import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Scale,
  Gavel,
  MessageSquareText,
  Clock3,
  ChevronRight,
  Check,
  FileText,
  ShieldCheck,
  X,
  LoaderCircle,
  RotateCcw,
  CircleHelp,
  Hand,
  Download,
  ChevronDown,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import type { CaseFile, Decision, Mode, Trial } from '../../shared/types';
import { DECISIONS, DISCLAIMER } from '../../shared/types';
import { CourtScene, Judge, Prosecutor, Defender } from './characters';
import { api, APIError, getTrial } from './api';

const names: Record<string, string> = {
  judge: '판사',
  prosecutor: '검사',
  defender: '변호사',
  plaintiff: '원고',
  defendant: '피고',
  clerk: '서기',
  user: '나의 진술',
};
const examples = [
  {
    title: '사라진 마지막 치킨',
    text: '어제 동생이 냉장고에 남겨둔 마지막 치킨을 제게 묻지 않고 먹었어요. 저는 저녁에 먹으려고 남겨둔 건데, 동생은 같이 시킨 치킨이니까 먹어도 되는 줄 알았다고 해요.',
  },
  {
    title: '묻지도 않고 부먹',
    text: '친구와 탕수육을 같이 주문했는데 친구가 물어보지 않고 소스를 전부 부었어요. 저는 찍어 먹는 걸 좋아하는데 친구는 제 취향을 몰랐다고 해요.',
  },
  {
    title: '룸메이트와 내 과자',
    text: '룸메이트가 제가 따로 사둔 과자를 말없이 먹었어요. 저는 제 선반에 올려뒀는데 룸메이트는 같이 먹는 간식인 줄 알았다고 합니다. 앞으로는 먼저 물어봤으면 좋겠어요.',
  },
];
function Button({
  children,
  secondary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      {...props}
      className={`button ${secondary ? 'secondary' : ''} ${props.className || ''}`}
    >
      {children}
    </button>
  );
}
function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
function remember(id: string) {
  try {
    sessionStorage.setItem('court-last-id', id);
  } catch {
    /* Storage is optional. */
  }
}
function lastTrial() {
  try {
    return sessionStorage.getItem('court-last-id');
  } catch {
    return null;
  }
}

export default function App() {
  const [help, setHelp] = useState(false);
  const [health, setHealth] = useState<{ aiMode: string; configured: boolean }>();
  useEffect(() => {
    api<typeof health>('/health')
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement as HTMLElement | null;
    const beforeOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function keyboard(e: KeyboardEvent) {
      if (e.key === 'Escape') setHelp(false);
      if (e.key !== 'Tab') return;
      const items = document.querySelectorAll<HTMLElement>(
        '[role="dialog"] button, [role="dialog"] a',
      );
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = beforeOverflow;
      document.removeEventListener('keydown', keyboard);
      previous?.focus();
    };
  }, [help]);
  return (
    <>
      <header className="site-header">
        <Link to="/" className="logo">
          <span className="logo-mark">
            <Scale size={23} />
          </span>
          <span>
            AI 억울법정<span className="logo-dot">.</span>
          </span>
        </Link>
        <nav aria-label="메인 메뉴">
          <NavLink to="/" end>
            법정 안내
          </NavLink>
          <NavLink to="/intake/plaintiff">사건 접수</NavLink>
          <button onClick={() => setHelp(true)}>
            이용 방법 <CircleHelp size={14} />
          </button>
        </nav>
        <Link className="header-action" to="/intake/plaintiff">
          법정 입장하기 <ArrowUpRight size={15} />
        </Link>
      </header>
      {health?.aiMode === 'mock' && (
        <div className="demo-banner">
          개발용 체험 모드 · 현재 대사는 테스트 목업입니다. 실제 Gemini 응답이 아닙니다.
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/intake/:mode" element={<Intake />} />
        <Route path="/trial/:id" element={<TrialPage />} />
        <Route
          path="*"
          element={
            <main className="small-page">
              <h1>찾을 수 없는 페이지입니다.</h1>
              <Link to="/" className="button">
                법정 안내로 돌아가기
              </Link>
            </main>
          }
        />
      </Routes>
      <footer className="site-footer">
        <Link to="/" className="footer-logo">
          <Scale size={18} /> AI 억울법정
        </Link>
        <span>{DISCLAIMER}</span>
        <span>작은 갈등, 새로운 관점.</span>
      </footer>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="이용 방법 닫기"
              onClick={() => setHelp(false)}
              autoFocus
            >
              <X />
            </button>
            <p className="eyebrow">HOW IT WORKS</p>
            <h2 id="help-title">
              당신의 이야기가
              <br />
              재판의 시작입니다.
            </h2>
            <ol className="help-steps">
              <li>
                <b>역할을 선택하세요.</b>
                <p>직접 사연을 접수하거나, 준비된 사건의 판사가 될 수 있어요.</p>
              </li>
              <li>
                <b>서로의 이야기를 들어보세요.</b>
                <p>심문은 최대 3회. 언제든 종료하고 최후 변론으로 이동할 수 있어요.</p>
              </li>
              <li>
                <b>새로운 관점을 가져가세요.</b>
                <p>원고 모드는 AI가, 판사 모드는 직접 판결합니다.</p>
              </li>
            </ol>
            <p className="muted">
              진행 단계는 되돌릴 수 없습니다. 기록은 같은 브라우저에서 2시간 동안 이어볼 수 있으며
              서버 재시작 시 사라집니다.
            </p>
            <Button onClick={() => setHelp(false)}>
              알겠습니다 <Check size={17} />
            </Button>
          </section>
        </div>
      )}
    </>
  );
}

function Home() {
  const saved = lastTrial();
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> 사소한 억울함을 위한 열린 법정
          </p>
          <h1>
            이 정도 일로
            <br />
            법정까지 <span className="title-question">와도 될까요?</span>
          </h1>
          <p className="hero-answer">
            네, 여기는 <strong>AI 억울법정</strong>이니까요.
          </p>
          <p className="hero-description">
            사소하지만 억울했던 순간,
            <br />
            AI 법정에서 따져보세요!
          </p>
          <div className="hero-buttons">
            <a href="#choose" className="button">
              나의 역할 선택하기 <ArrowRight size={18} />
            </a>
            <span>
              <Clock3 size={16} /> 재판 한 번, 약 3–5분
            </span>
          </div>
          <div className="hero-social">
            <div className="mini-avatars">
              <span>
                <Prosecutor />
              </span>
              <span>
                <Judge />
              </span>
              <span>
                <Defender />
              </span>
            </div>
            <p>
              세 가지 시선으로 듣고,
              <br />
              <b>한쪽 말만으로 판단하지 않아요.</b>
            </p>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-topline">
            <span>THE EVERYDAY COURT</span>
            <span>EST. 2026</span>
          </div>
          <CourtScene />
          <div className="visual-bottomline">
            <span>엄숙한 재판, 사소한 사건.</span>
            <span>
              개정 준비 완료 <i />
            </span>
          </div>
        </div>
      </section>
      <div className="principles">
        <span>
          <ShieldCheck size={17} /> 편들기보다 공정하게
        </span>
        <i />
        <span>
          <MessageSquareText size={17} /> 질문은 최대 3번
        </span>
        <i />
        <span>
          <Scale size={17} /> 법적 부담 없는 가상 재판
        </span>
      </div>
      <section id="choose" className="mode-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CHOOSE YOUR SIDE</p>
            <h2>오늘, 어떤 자리에서 시작할까요?</h2>
          </div>
          <p>이야기하는 사람도, 판단하는 사람도 당신.</p>
        </div>
        <div className="mode-grid">
          <Link to="/intake/plaintiff" className="mode-card plaintiff-card">
            <div className="mode-card-top">
              <span className="mode-tag">MODE A · 원고석</span>
              <span className="card-icon">
                <MessageSquareText size={23} />
              </span>
            </div>
            <h3>내 억울함 재판받기</h3>
            <p>
              “제 이야기 좀 들어봐 주세요.”
              <br />
              나의 사연을 접수하고 AI 법정의 판결을 받아보세요.
            </p>
            <div className="mode-bottom">
              <span>
                내 사연으로 시작 <ArrowRight size={17} />
              </span>
              <small>AI 판사 · 검사 · 변호사 참여</small>
            </div>
          </Link>
          <Link to="/intake/judge" className="mode-card judge-card">
            <div className="mode-card-top">
              <span className="mode-tag">MODE B · 판사석</span>
              <span className="card-icon">
                <Gavel size={24} />
              </span>
            </div>
            <h3>오늘은 내가 판사</h3>
            <p>
              “양측의 주장을 들어보겠습니다.”
              <br />
              AI 원고와 피고의 이야기를 듣고 직접 판결해 보세요.
            </p>
            <div className="mode-bottom">
              <span>
                판사석에 앉기 <ArrowRight size={17} />
              </span>
              <small>준비된 사건 3개</small>
            </div>
          </Link>
        </div>
        {saved && (
          <Link className="resume-link" to={`/trial/${saved}`}>
            <RotateCcw size={15} /> 마지막 재판 이어보기 <ChevronRight size={15} />
          </Link>
        )}
      </section>
      <section className="case-teaser">
        <span className="teaser-label">이런 사건도 되나요?</span>
        <div>
          <span>🍗 마지막 치킨 실종 사건</span>
          <span>🥡 탕수육 소스 무단 투하</span>
          <span>⏰ “거의 다 왔어”의 진실</span>
        </div>
        <p>네. 사소할수록 환영합니다.</p>
      </section>
      <section className="home-note">
        <span className="note-line" />
        <Scale size={26} />
        <p>
          승패보다 중요한 건,
          <br />
          <strong>미처 생각하지 못했던 서로의 입장.</strong>
        </p>
        <span className="note-line" />
      </section>
    </main>
  );
}

function Intake() {
  const { mode: param } = useParams();
  const mode: Mode = param === 'judge' ? 'judge' : 'plaintiff';
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (mode === 'judge')
      api<CaseFile[]>('/cases')
        .then(setCases)
        .catch((e) => setError(e.message));
  }, [mode]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    if (mode === 'plaintiff' && summary.trim().length < 20) {
      setError('누가, 어떤 상황에서, 무엇을 했는지 20자 이상으로 설명해 주세요.');
      return;
    }
    if (mode === 'judge' && !selected) {
      setError('판결할 사건을 하나 선택해 주세요.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    const payload = { mode, title, summary, caseId: selected || undefined };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    try {
      const trial = await api<Trial>('/trials', { ...payload, requestId: pending.current!.id });
      remember(trial.id);
      navigate(`/trial/${trial.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="intake-page">
      <Link className="back-link" to="/">
        ← 역할 다시 선택하기
      </Link>
      <div className="intake-layout">
        <section>
          <p className="eyebrow">{mode === 'judge' ? 'TAKE THE BENCH' : 'FILE YOUR STORY'}</p>
          <h1>
            {mode === 'judge' ? (
              <>
                판사님,
                <br />
                어떤 사건을 맡으시겠어요?
              </>
            ) : (
              <>
                작은 억울함도
                <br />
                들어드리겠습니다.
              </>
            )}
          </h1>
          <p className="intro">
            {mode === 'judge'
              ? '세 가지 사건, 서로 다른 입장. 양측의 이야기를 듣고 당신만의 공정한 판결을 내려주세요.'
              : '누구와 무슨 일이 있었나요? 정리되지 않은 이야기여도 괜찮아요. 법정에서 함께 살펴볼게요.'}
          </p>
          <div className="intake-character">
            <Judge />
            <div>
              <b>입장이 달라도, 공정하게.</b>
              <p>
                확인된 사실과 주장을 구분하여
                <br />
                차분히 진행하겠습니다.
              </p>
            </div>
          </div>
          <div className="intake-tips">
            <p>
              <Check size={16} /> 심문은 최대 3회, 약 3–5분
            </p>
            <p>
              <Check size={16} /> 진행 중 언제든 심문 종료 가능
            </p>
            <p>
              <ShieldCheck size={16} /> 이름·연락처 등 개인정보 입력은 피해주세요.
            </p>
          </div>
        </section>
        <form className="intake-form" onSubmit={submit}>
          {mode === 'plaintiff' ? (
            <>
              <div className="form-heading">
                <h2>사건 접수서</h2>
                <span>01 / 시작</span>
              </div>
              <label htmlFor="title">
                사건 제목 <small>선택</small>
              </label>
              <input
                id="title"
                value={title}
                maxLength={65}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="어떤 사건인가요?"
                disabled={busy}
              />
              <p className="field-hint">비워두시면 AI가 이야기에서 제목을 붙여드려요.</p>
              <label htmlFor="summary">
                사건 내용 <span className="required">*</span>
              </label>
              <textarea
                id="summary"
                value={summary}
                minLength={20}
                maxLength={5000}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="누가, 언제, 어떤 일을 했는지 알려주세요. 무엇이 서운했는지, 상대방은 어떻게 설명했는지도 적어주세요."
                rows={8}
                disabled={busy}
                required
              />
              <div className="textarea-meta">
                <span>최소 20자</span>
                <span>{summary.length.toLocaleString()} / 5,000</span>
              </div>
              <div className="examples">
                <span>이런 사연은 어때요?</span>
                <div>
                  {examples.map((ex) => (
                    <button
                      key={ex.title}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setTitle(ex.title);
                        setSummary(ex.text);
                        setError('');
                      }}
                    >
                      {ex.title} <span>+</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-heading">
                <h2>오늘의 사건 파일</h2>
                <span>3 CASES</span>
              </div>
              <div className="case-options">
                {cases.map((c, i) => (
                  <label
                    key={c.id}
                    className={`case-option ${selected === c.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="case"
                      value={c.id}
                      checked={selected === c.id}
                      onChange={() => setSelected(c.id)}
                      disabled={busy}
                    />
                    <span className="case-number">0{i + 1}</span>
                    <span>
                      <span className="case-category">
                        {c.category} · {c.difficulty}
                      </span>
                      <b>{c.title}</b>
                      <span className="case-description">{c.description}</span>
                    </span>
                    <span className="radio-mark">{selected === c.id && <Check size={13} />}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <Button type="submit" disabled={busy || (mode === 'judge' && !selected)}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={18} /> 법정이 사건을 살펴보고 있어요…
              </>
            ) : (
              <>
                재판 시작하기 <ArrowRight size={18} />
              </>
            )}
          </Button>
          <p className="form-disclaimer">
            {DISCLAIMER}
            <br />
            실제 범죄·폭력 등 심각한 피해는 이 서비스에서 다루지 않습니다.
          </p>
        </form>
      </div>
    </main>
  );
}

function TrialPage() {
  const { id } = useParams();
  const [trial, setTrial] = useState<Trial>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<'plaintiff' | 'defendant'>('plaintiff');
  const [decision, setDecision] = useState<Decision>();
  const [objection, setObjection] = useState<string>();
  const [record, setRecord] = useState(false);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const lock = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  async function reload() {
    try {
      setError('');
      const loaded = await getTrial(id!);
      setTrial(loaded);
      remember(loaded.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => {
    let cancelled = false;
    getTrial(id!)
      .then((t) => {
        if (!cancelled) {
          setTrial(t);
          remember(t.id);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [trial?.messages.length, busy]);
  async function action(type: 'answer' | 'end' | 'verdict' | 'objection') {
    if (!trial || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const payload = {
      type,
      version: trial.version,
      input: type === 'end' ? '' : input,
      target,
      decision,
      messageId: objection,
    };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    try {
      const next = await api<Trial>(`/trials/${trial.id}/actions`, {
        ...payload,
        requestId: pending.current!.id,
      });
      setTrial(next);
      setInput('');
      setObjection(undefined);
      pending.current = null;
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof APIError && err.code === 'STALE_VERSION') await reload();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!trial)
    return (
      <main className="small-page">
        {error ? (
          <>
            <ErrorNotice>{error}</ErrorNotice>
            <div className="action-row">
              <Button onClick={reload} secondary>
                다시 불러오기
              </Button>
              <Link className="button" to="/intake/plaintiff">
                새 사건 접수
              </Link>
            </div>
          </>
        ) : (
          <p role="status">
            <LoaderCircle size={22} className="spin" /> 재판 기록을 불러오고 있습니다.
          </p>
        )}
      </main>
    );
  if (trial.phase === 'safety')
    return (
      <main className="small-page safety-page">
        <ShieldCheck size={44} />
        <p className="eyebrow">당신의 안전이 먼저입니다</p>
        <h1>
          가볍게 다루기 어려운
          <br />
          이야기로 보입니다.
        </h1>
        <p>
          실제 폭력·학대·범죄 등 심각한 피해는 가상 재판으로 판단하지 않습니다. 이 사건의 재판은
          진행하지 않을게요.
        </p>
        <p>
          위험한 상황이라면 안전한 장소로 이동하고, 신뢰하는 사람이나 적절한 전문기관에 도움을
          요청해 주세요.
        </p>
        <Link to="/" className="button">
          법정 안내로 돌아가기 <ArrowRight size={17} />
        </Link>
      </main>
    );
  if (trial.phase === 'completed') return <VerdictPage trial={trial} />;
  const closing = trial.phase === 'closing';
  const aiMessages = trial.messages.filter((m) => m.speaker !== 'user');
  const active = aiMessages.at(-1)?.speaker || 'judge';
  const hasObjected = trial.messages.some((m) => m.kind === 'objection');
  return (
    <main className="trial-page">
      <div className="trial-top">
        <div>
          <p className="eyebrow">
            {trial.mode === 'judge' ? '내가 판사 · 직접 판결하는 재판' : '내 억울함 재판받기'}
          </p>
          <h1>{trial.title}</h1>
        </div>
        <span className="session-id">사건 #{trial.id.slice(0, 8).toUpperCase()}</span>
      </div>
      <div className="trial-progress" aria-label="재판 진행 단계">
        {['사건 접수', '공방 · 심문', '최후 변론', '판결'].map((s, i) => (
          <div
            key={s}
            className={i < (closing ? 2 : 1) ? 'done' : i === (closing ? 2 : 1) ? 'current' : ''}
          >
            <span>{i < (closing ? 2 : 1) ? <Check size={12} /> : `0${i + 1}`}</span>
            {s}
            {i < 3 && <ChevronRight size={14} />}
          </div>
        ))}
      </div>
      <div className="trial-layout">
        <aside className="court-panel">
          <div className="panel-label">
            <span>
              <span className="live-dot" /> 재판 진행 중
            </span>
            <span>심문 {trial.questionCount} / 3</span>
          </div>
          <CourtScene compact active={active} mode={trial.mode} />
          <div className="seat-info">
            <span>오늘의 {trial.mode === 'judge' ? '판사' : '원고'}</span>
            <strong>
              당신 <span>YOU</span>
            </strong>
            <p>
              {trial.mode === 'judge'
                ? '질문하고, 충분히 들었다면 판결해 주세요.'
                : '편안하게 이야기하세요. 차분히 듣겠습니다.'}
            </p>
          </div>
          <button
            className="record-toggle"
            onClick={() => setRecord(!record)}
            aria-expanded={record}
          >
            <BookOpen size={16} /> 사건 기록 보기 <ChevronDown size={15} />
          </button>
          {record && <FactRecord trial={trial} />}
          <p className="panel-footnote">
            진행한 단계는 되돌릴 수 없습니다.
            <br />
            기록은 같은 브라우저에서 2시간 유지됩니다.
          </p>
        </aside>
        <section className="hearing-panel">
          <div className="hearing-heading">
            <div>
              <span className="eyebrow">{closing ? 'CLOSING STATEMENT' : 'IN SESSION'}</span>
              <h2>
                {closing
                  ? trial.mode === 'judge'
                    ? '판사님의 판단을 남겨주세요.'
                    : '마지막으로 하고 싶은 말이 있나요?'
                  : trial.mode === 'judge'
                    ? '양측의 이야기를 들어보세요.'
                    : '양측의 입장을 살펴봅니다.'}
              </h2>
            </div>
            <span className="question-badge">
              {closing ? '심문 종료' : `${trial.questionCount} / 3`}
            </span>
          </div>
          {!closing ? (
            <>
              <div
                className="message-log"
                ref={logRef}
                role="log"
                aria-label="법정 대화 기록"
                aria-live="polite"
              >
                {trial.messages.map((m) => (
                  <article key={m.id} className={`court-message speaker-${m.speaker}`}>
                    <div className="message-avatar">
                      {m.speaker === 'defender' || m.speaker === 'defendant' ? (
                        <Defender />
                      ) : m.speaker === 'judge' ? (
                        <Judge />
                      ) : m.speaker === 'user' ? (
                        <span>나</span>
                      ) : (
                        <Prosecutor />
                      )}
                    </div>
                    <div className="message-body">
                      <div className="message-byline">
                        <b>
                          {m.speaker === 'user' && trial.mode === 'judge'
                            ? '나 · 판사'
                            : names[m.speaker]}
                        </b>
                        {m.speaker !== 'user' && <span>AI</span>}
                        {m.kind === 'question' && <small>심문 질문</small>}
                        {m.kind === 'objection' && <small>이의 제기</small>}
                      </div>
                      <p>{m.content}</p>
                      {m.speaker !== 'user' && m.kind !== 'question' && !hasObjected && (
                        <button
                          className="object-button"
                          disabled={busy}
                          onClick={() => {
                            setObjection(m.id);
                            setInput('');
                          }}
                        >
                          <Hand size={12} /> 이의 있습니다
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {busy && (
                  <p className="thinking" role="status">
                    <LoaderCircle size={15} className="spin" />{' '}
                    {trial.mode === 'judge'
                      ? '당사자가 답변을 준비하고 있습니다…'
                      : '법정이 진술을 검토하고 있습니다…'}
                  </p>
                )}
              </div>
              <form
                className="hearing-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(objection ? 'objection' : 'answer');
                }}
              >
                {objection ? (
                  <div className="objection-box">
                    <Hand size={16} />
                    <span>
                      선택한 발언에 이의를 제기합니다. 심문 1회로 처리되며 재판당 1회 가능합니다.
                    </span>
                    <button
                      type="button"
                      aria-label="이의 제기 취소"
                      onClick={() => setObjection(undefined)}
                      disabled={busy}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  trial.mode === 'judge' && (
                    <div className="target-picker">
                      <span>질문할 당사자</span>
                      {(['plaintiff', 'defendant'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          disabled={busy}
                          className={target === t ? 'active' : ''}
                          onClick={() => setTarget(t)}
                        >
                          {names[t]}
                        </button>
                      ))}
                    </div>
                  )
                )}
                <label className="sr-only" htmlFor="testimony">
                  {objection
                    ? '반박 내용'
                    : trial.mode === 'judge'
                      ? '당사자에게 질문'
                      : '질문에 대한 진술'}
                </label>
                <textarea
                  id="testimony"
                  maxLength={3000}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={busy}
                  placeholder={
                    objection
                      ? '어떤 점에 이의가 있나요? 근거와 함께 알려주세요.'
                      : trial.mode === 'judge'
                        ? '선택한 당사자에게 한 가지 질문을 해보세요.'
                        : '판사의 질문에 답해주세요. 모르는 내용은 모른다고 해도 괜찮아요.'
                  }
                  rows={3}
                  required
                />
                <div className="input-actions">
                  <span>{input.length.toLocaleString()} / 3,000</span>
                  <Button type="submit" disabled={busy || !input.trim()}>
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <>
                        {objection ? '이의 제출' : trial.mode === 'judge' ? '질문하기' : '진술하기'}{' '}
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                </div>
              </form>
              <button className="end-button" disabled={busy} onClick={() => void action('end')}>
                충분히 들었어요. 심문 종료하기 <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <div className="closing-content">
              <FactRecord trial={trial} />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action('verdict');
                }}
              >
                {trial.mode === 'judge' && (
                  <fieldset className="decisions">
                    <legend>
                      판결 결과 <span className="required">*</span>
                    </legend>
                    {DECISIONS.map((d) => (
                      <label key={d}>
                        <input
                          type="radio"
                          name="decision"
                          value={d}
                          checked={decision === d}
                          onChange={() => setDecision(d)}
                          disabled={busy}
                          required
                        />
                        {d}
                      </label>
                    ))}
                  </fieldset>
                )}
                <label htmlFor="final">
                  {trial.mode === 'judge' ? '판결 이유' : '최후 진술'}{' '}
                  <small>선택 · 생략할 수 있어요</small>
                </label>
                <textarea
                  id="final"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={3000}
                  rows={4}
                  disabled={busy}
                  placeholder={
                    trial.mode === 'judge'
                      ? '어떤 근거로 판단했는지 남겨주세요.'
                      : '마지막으로 전하고 싶은 이야기를 적어주세요.'
                  }
                />
                <div className="textarea-meta">
                  <span>이후에는 추가 심문 없이 판결합니다.</span>
                  <span>{input.length} / 3,000</span>
                </div>
                <Button type="submit" disabled={busy || (trial.mode === 'judge' && !decision)}>
                  {busy ? (
                    <>
                      <LoaderCircle size={18} className="spin" /> 판결문을 정리하고 있습니다…
                    </>
                  ) : (
                    <>
                      {trial.mode === 'judge'
                        ? '이 판결로 확정하기'
                        : input.trim()
                          ? '판결 요청하기'
                          : '최후 진술 생략하고 판결받기'}{' '}
                      <Gavel size={17} />
                    </>
                  )}
                </Button>
              </form>
              <details className="transcript">
                <summary>전체 재판 기록 확인</summary>
                {trial.messages.map((m) => (
                  <p key={m.id}>
                    <b>{names[m.speaker]}</b> {m.content}
                  </p>
                ))}
              </details>
            </div>
          )}
          {error && <ErrorNotice>{error}</ErrorNotice>}
        </section>
      </div>
    </main>
  );
}

function FactRecord({ trial }: { trial: Trial }) {
  const groups = [
    { title: '확인된 사실', items: trial.confirmedFacts.map((f) => f.text) },
    { title: '원고의 진술', items: trial.claims.map((f) => f.text) },
    { title: '피고의 진술', items: trial.opposingClaims.map((f) => f.text) },
    { title: '다투는 쟁점', items: trial.disputedClaims },
    { title: '미확인 정보', items: trial.unresolvedIssues },
    { title: '진술 간 모순', items: trial.contradictions },
  ];
  return (
    <div className="fact-record">
      {groups.map((g) => (
        <div key={g.title}>
          <h3>
            <span />
            {g.title}
          </h3>
          {g.items.length ? (
            <ul>
              {g.items.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          ) : (
            <p>
              {g.title === '확인된 사실'
                ? '독립적으로 확인된 사실이 없습니다.'
                : '기록된 내용이 없습니다.'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function VerdictPage({ trial }: { trial: Trial }) {
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState(false);
  const verdict = trial.verdict!;
  function saveSVG() {
    const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
      );
    const wrap = (s: string, max = 29) => {
      const chars = [...s];
      const lines = [];
      for (let i = 0; i < chars.length; i += max) lines.push(chars.slice(i, i + max).join(''));
      return lines;
    };
    const content = [
      ...wrap(trial.title),
      '',
      ...wrap(verdict.title),
      ...wrap(verdict.result),
      '',
      ...verdict.reasons.flatMap((r) => wrap(`· ${r}`)),
      '',
      ...(verdict.unresolved.length
        ? ['미확인 정보', ...verdict.unresolved.flatMap((r) => wrap(`· ${r}`)), '']
        : []),
      ...wrap(`화해 권고: ${verdict.reconciliation}`),
      '',
      ...wrap(`판사의 한마디: ${verdict.lastWord}`),
      '',
      DISCLAIMER,
      ...(trial.aiMode === 'mock' ? ['개발용 목업으로 생성한 테스트 판결문입니다.'] : []),
    ];
    const height = 210 + content.length * 29;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}"><rect width="760" height="${height}" fill="#f8f5ee"/><rect x="22" y="22" width="716" height="${height - 44}" rx="8" fill="none" stroke="#ba9b64"/><text x="60" y="82" fill="#273a4b" font-family="sans-serif" font-size="24" font-weight="bold">AI 억울법정 · 가상 판결문</text><text x="60" y="118" fill="#777" font-family="sans-serif" font-size="14">사건 ${escape(trial.id.slice(0, 8).toUpperCase())} · ${new Date(trial.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</text>${content.map((line, i) => `<text x="60" y="${175 + i * 29}" fill="#303b40" font-family="sans-serif" font-size="${i < 3 ? 21 : 17}">${escape(line)}</text>`).join('')}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-억울법정-${trial.id.slice(0, 8)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
  }
  return (
    <main className="verdict-page">
      <p className="eyebrow">THE COURT HAS SPOKEN</p>
      <h1>
        {trial.mode === 'judge' ? '판사님의 판결이 내려졌습니다.' : '오늘의 재판을 마칩니다.'}
      </h1>
      <p className="verdict-intro">조금 다른 관점이, 조금 더 나은 대화의 시작이 되길.</p>
      <article className="verdict-card">
        <div className="verdict-top">
          <span>AI 억울법정</span>
          <span>사건 #{trial.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="verdict-emblem">
          <Scale size={34} />
        </div>
        <span className="verdict-label">가 상 판 결 문</span>
        <p className="verdict-case">{trial.title}</p>
        <h2>{verdict.title}</h2>
        <div className="verdict-result">{verdict.result}</div>
        <section>
          <h3>판단 근거</h3>
          <ol>
            {verdict.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
        {verdict.unresolved.length > 0 && (
          <section>
            <h3>판단에 사용하지 않은 미확인 정보</h3>
            <ul>
              {verdict.unresolved.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="reconciliation">
          <h3>법정의 화해 권고</h3>
          <p>{verdict.reconciliation}</p>
        </section>
        <blockquote>“{verdict.lastWord}”</blockquote>
        <div className="verdict-sign">
          <Judge expression="verdict" />
          <span>
            {trial.mode === 'judge' ? '판사 · 당신' : 'AI 억울법정 재판부'}
            <small>
              {new Date(trial.createdAt).toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </small>
          </span>
          <div className="verdict-stamp">
            재판
            <br />
            종결
          </div>
        </div>
        <p className="verdict-disclaimer">{DISCLAIMER}</p>
        {trial.aiMode === 'mock' && (
          <p className="verdict-disclaimer">개발용 목업으로 생성한 테스트 판결문입니다.</p>
        )}
      </article>
      <div className="save-review">
        <label>
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />{' '}
          저장될 사연과 판결에 개인정보가 없는지 확인했습니다.
        </label>
        <Button secondary onClick={saveSVG} disabled={!review}>
          <Download size={17} /> {saved ? '다시 이미지 저장' : '판결문 이미지 저장 (SVG)'}
        </Button>
      </div>
      <Link to="/" className="button">
        새로운 사건 시작하기 <ArrowRight size={17} />
      </Link>
      <details className="verdict-record transcript">
        <summary>
          <FileText size={16} /> 재판 기록 확인하기
        </summary>
        <FactRecord trial={trial} />
        {trial.messages.map((m) => (
          <p key={m.id}>
            <b>{names[m.speaker]}</b> {m.content}
          </p>
        ))}
      </details>
    </main>
  );
}
