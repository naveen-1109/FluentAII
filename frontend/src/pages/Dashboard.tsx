import { Activity, ArrowRight, AudioLines, BadgeCheck, Route, CalendarClock, Clock, Flame, Gauge, Mic, Stethoscope, Target, Trophy, Users } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { ActivityChart, ActivityMix, GoalRing, practiceStats, StatCard, TipCard } from '../components/dashboard';
import { Link } from 'react-router-dom';
import { MetricTile, FlowRing, TrendChart, trendPoints } from '../components/insights';
import { Alert, Badge, EmptyState, SectionTitle, Spinner, VerifiedBadge } from '../components/ui';
import { api, type RoadmapResponse } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFeatures } from '../lib/features';
import { ACTIVITY_LABEL, fmtDate, fmtDateTime, fmtDuration, fmtNum, MODE_LABEL } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { StatusBadge } from './Sessions';

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'clinician' ? <ClinicianDashboard /> : <PatientDashboard />;
}

function DashHero({ title, subtitle, children, aside }: { title: string; subtitle: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <section className="dash-hero rise mb-6 p-6 sm:p-8">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-lime">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-lg text-[15px] text-white/65">{subtitle}</p>
          {children && <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}

function PatientDashboard() {
  const { user } = useAuth();
  const s = useAsync(() => api.sessions.list());
  const a = useAsync(() => api.care.appointments());
  const { features: f, weeklyGoal: WEEKLY_GOAL, announcement } = useFeatures();
  const rm = useAsync(() => (f.roadmap ? api.roadmap.get() : Promise.resolve(null)), [f.roadmap]);
  const first = user?.fullName.split(' ')[0] ?? '';

  if (s.loading || a.loading) return <Spinner />;
  const sessions = s.data?.sessions ?? [];
  const canRecord = f.recording || f.upload;
  const notice = announcement ? (
    <Alert tone="info" title="Notice from FluentAI" className="mb-6">{announcement}</Alert>
  ) : null;
  const done = sessions.filter((x) => x.status === 'completed');
  const latest = done[0];
  const upcoming = (a.data?.appointments ?? [])
    .filter((x) => x.status === 'accepted' && new Date(x.requestedStart) > new Date())
    .sort((x, y) => x.requestedStart.localeCompare(y.requestedStart));
  const pending = (a.data?.appointments ?? []).filter((x) => x.status === 'requested').length;
  const st = practiceStats(sessions);
  const recordBtn = canRecord && (
    <Link to="/app/record" className="btn-lime inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold">
      <Mic className="h-4 w-4" aria-hidden /> New recording
    </Link>
  );

  if (sessions.length === 0) {
    const starts = [
      { Icon: Mic, title: 'Make your first recording', text: 'Speak for a minute or two about anything. You will get your first insights as soon as it has been analysed.', to: '/app/record', cta: 'Start recording' },
      { Icon: Stethoscope, title: 'Find a clinician', text: 'Browse verified speech-language professionals and request a consultation when you are ready.', to: '/app/clinicians', cta: 'Browse clinicians' },
      { Icon: Target, title: 'Set a weekly rhythm', text: `Short, regular practice adds up. Aim for ${WEEKLY_GOAL} short sessions a week to start seeing a trend.`, to: '/app/record', cta: 'Plan a session' },
    ].filter((c) => (c.to !== '/app/record' || canRecord) && (c.to !== '/app/clinicians' || f.clinicianDirectory));
    return (
      <>
        <DashHero title={`Hello, ${first}`} subtitle="Welcome to FluentAI. Here is how to get started." aside={<div className="hidden sm:block"><GoalRing value={0} goal={WEEKLY_GOAL} /><p className="mt-1 text-center text-xs text-white/55">This week</p></div>}>
          {recordBtn}
        </DashHero>
        {notice}
        {(s.error || a.error) && <Alert tone="danger" className="mb-6">{s.error ?? a.error}</Alert>}
        <div className={`grid grid-cols-1 gap-5 ${starts.length === 3 ? 'md:grid-cols-3' : starts.length === 2 ? 'md:grid-cols-2' : ''}`}>
          {starts.map(({ Icon, title, text, to, cta }, i) => (
            <section key={title} className="stat-card rise card flex flex-col p-6" style={{ '--d': `${i * 80}ms` } as CSSProperties}>
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="text-3xl font-semibold text-line-strong">0{i + 1}</span>
              </div>
              <h2 className="mt-5 text-lg font-semibold">{title}</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">{text}</p>
              <Link to={to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:gap-2.5 transition-all">{cta} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </section>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="card p-6 lg:col-span-2">
            <SectionTitle>What you will see after your first session</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Flow index', 'out of 100'], ['Pace', 'words / min'], ['Pauses', '≥ 0.5 s'], ['Repetitions', 'count']].map(([k, u]) => (
                <div key={k} className="rounded-xl border border-dashed border-line-strong p-4">
                  <p className="text-[13px] text-ink-muted">{k}</p><p className="mt-1 text-2xl font-semibold text-line-strong">—</p><p className="text-xs text-ink-faint">{u}</p>
                </div>
              ))}
            </div>
          </section>
          {f.practiceTips && <TipCard />}
        </div>
      </>
    );
  }

  const delta = st.flowDelta;
  return (
    <>
      <DashHero
        title={`Hello, ${first}`}
        subtitle={st.thisWeek ? `You have practised ${st.thisWeek} time${st.thisWeek === 1 ? '' : 's'} in the last 7 days. Keep it up.` : 'Here is how your practice is going.'}
        aside={
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-semibold"><Flame className="h-6 w-6 text-lime" aria-hidden />{st.streak}</div>
              <p className="mt-1 text-xs text-white/55">day streak</p>
            </div>
            <div className="h-14 w-px bg-white/15" aria-hidden />
            <div className="text-center"><GoalRing value={st.thisWeek} goal={WEEKLY_GOAL} /><p className="mt-1 text-xs text-white/55">Weekly goal</p></div>
          </div>
        }
      >
        {recordBtn}
        {latest && <Link to={`/app/sessions/${latest.id}`} className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-[15px] font-medium text-white hover:bg-white/10">View latest results</Link>}
      </DashHero>
      {notice}
      {(s.error || a.error) && <Alert tone="danger" className="mb-6">{s.error ?? a.error}</Alert>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard delay={0} color="#0F7880" icon={<Activity className="h-[18px] w-[18px]" aria-hidden />} label="Average flow" value={fmtNum(st.avgFlow)} unit="/100" spark={st.flowSeries}
          foot={delta != null ? <span className={delta >= 0 ? 'font-medium text-ok' : 'font-medium text-warn'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} <span className="font-normal text-ink-muted">vs earlier sessions</span></span> : 'Across analysed sessions'} />
        <StatCard delay={60} color="#7FA600" icon={<Trophy className="h-[18px] w-[18px]" aria-hidden />} label="Best flow" value={fmtNum(st.bestFlow)} unit="/100" foot="Your highest so far" />
        <StatCard delay={120} color="#2B6CB0" icon={<Gauge className="h-[18px] w-[18px]" aria-hidden />} label="Average pace" value={fmtNum(st.avgPace)} unit="wpm" spark={st.paceSeries} foot="Words per minute while speaking" />
        <StatCard delay={180} color="#A8650F" icon={<Clock className="h-[18px] w-[18px]" aria-hidden />} label="Practice time" value={st.minutes < 10 ? st.minutes.toFixed(1) : Math.round(st.minutes)} unit="min" foot={`${sessions.length} recording${sessions.length === 1 ? '' : 's'}, ${st.analysed} analysed`} />
      </div>

      {rm.data?.roadmap.ready && <RoadmapCard data={rm.data} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className={`card p-6 ${f.progressCharts ? 'lg:col-span-2' : 'lg:col-span-3'}`} aria-labelledby="latest">
          <SectionTitle aside={latest && <Link className="text-sm font-medium text-brand-700 hover:underline" to={`/app/sessions/${latest.id}`}>Open session</Link>}>
            <span id="latest">Latest analysed session</span>
          </SectionTitle>
          {latest ? (
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <FlowRing value={latest.flowIndex} />
              <div>
                <p className="font-medium">{latest.title}</p>
                <p className="mb-4 text-sm text-ink-muted">{ACTIVITY_LABEL[latest.activity]} · {fmtDate(latest.createdAt)} · {fmtDuration(latest.durationSec)}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MetricTile label="Pace" value={fmtNum(latest.speechRateWpm)} unit="words/min" />
                  <MetricTile label="Words" value={fmtNum(latest.wordCount)} />
                  <MetricTile label="Shared with" value={latest.sharedWith} unit={latest.sharedWith === 1 ? 'clinician' : 'clinicians'} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No session has been analysed yet. Open a recording and choose “Analyse”.</p>
          )}
        </section>

        {f.progressCharts && <section className="card p-6" aria-labelledby="activity">
          <SectionTitle aside={<span className="text-xs text-ink-muted">Last 14 days</span>}><span id="activity">Practice activity</span></SectionTitle>
          <ActivityChart days={st.days} />
          <p className="mt-3 text-xs text-ink-muted">Minutes recorded per day. Today is highlighted.</p>
        </section>}

        {f.progressCharts && <section className="card p-6 lg:col-span-2" aria-labelledby="trend">
          <SectionTitle><span id="trend">Flow index over time</span></SectionTitle>
          <TrendChart title="Flow index across analysed sessions" points={trendPoints(done.slice(0, 12), (x) => x.flowIndex)} />
          {st.flowSeries.length >= 2 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ['First session', Math.round(st.flowSeries[0]!)],
                ['Latest session', Math.round(st.flowSeries[st.flowSeries.length - 1]!)],
                ['Change', `${st.flowSeries[st.flowSeries.length - 1]! - st.flowSeries[0]! >= 0 ? '+' : ''}${Math.round(st.flowSeries[st.flowSeries.length - 1]! - st.flowSeries[0]!)}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface px-4 py-3"><p className="text-xs text-ink-muted">{k}</p><p className="mt-0.5 text-lg font-semibold">{v}</p></div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-muted">Compare with your own earlier sessions. The index describes a single recording and is not a clinical score.</p>
        </section>}
        <div className="flex flex-col gap-6">
          {f.progressCharts && <section className="card p-6" aria-labelledby="mix">
            <SectionTitle><span id="mix">What you practised</span></SectionTitle>
            <ActivityMix mix={st.mix} />
          </section>}
          <section className="card p-6" aria-labelledby="up">
            <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/appointments">All</Link>}>
              <span id="up">Consultations</span>
            </SectionTitle>
            {upcoming.length ? (
              <ul className="space-y-3">
                {upcoming.slice(0, 3).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3 text-sm">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">{initials(x.otherName)}</span>
                    <span className="min-w-0"><span className="flex items-center gap-1.5 font-medium"><span className="truncate">{x.otherName}</span>{x.otherVerified && <VerifiedBadge />}</span><span className="text-ink-muted">{fmtDateTime(x.requestedStart)} · {MODE_LABEL[x.mode]}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Nothing booked yet.{pending ? ` ${pending} request${pending > 1 ? 's' : ''} awaiting a reply.` : ''}</p>
            )}
            {f.clinicianDirectory && <Link to="/app/clinicians" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Find a clinician →</Link>}
          </section>
        </div>

        <section className="card p-6 lg:col-span-2" aria-labelledby="recent">
          <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/sessions">All</Link>}>
            <span id="recent">Recent sessions</span>
          </SectionTitle>
          <ul className="divide-y divide-line">
            {sessions.slice(0, 5).map((x) => (
              <li key={x.id}>
                <Link to={`/app/sessions/${x.id}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 text-sm transition hover:bg-surface">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><AudioLines className="h-[18px] w-[18px]" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{x.title}</span>
                    <span className="text-xs text-ink-muted">{ACTIVITY_LABEL[x.activity]} · {fmtDate(x.createdAt)} · {fmtDuration(x.durationSec)}</span>
                  </span>
                  {x.flowIndex != null && <span className="hidden text-right sm:block"><span className="block text-base font-semibold leading-none">{Math.round(x.flowIndex)}</span><span className="text-[11px] text-ink-faint">flow</span></span>}
                  <StatusBadge s={x.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {f.practiceTips && <TipCard />}
      </div>
    </>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function ClinicianDashboard() {
  const { user } = useAuth();
  const a = useAsync(() => api.care.appointments());
  const verified = user?.verification === 'verified';
  const p = useAsync(() => (verified ? api.care.patients() : Promise.resolve({ patients: [] })), [verified]);

  if (a.loading || p.loading) return <Spinner />;
  const appts = a.data?.appointments ?? [];
  const pending = appts.filter((x) => x.status === 'requested');
  const upcoming = appts.filter((x) => x.status === 'accepted' && new Date(x.requestedStart) > new Date())
    .sort((x, y) => x.requestedStart.localeCompare(y.requestedStart));
  const patients = p.data?.patients ?? [];

  return (
    <>
      <DashHero
        title={`Welcome, ${user?.fullName}`}
        subtitle="Consultation requests and the sessions your patients share."
        aside={verified ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
            <BadgeCheck className="h-6 w-6 text-lime" aria-hidden />
            <div><p className="text-sm font-semibold">Verified clinician</p><p className="text-xs text-white/60">Licence checked and valid</p></div>
          </div>
        ) : undefined}
      >
        <Link to="/app/appointments" className="btn-lime inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold"><CalendarClock className="h-4 w-4" aria-hidden /> Review requests</Link>
      </DashHero>
      {user?.verification === 'pending' && (
        <Alert tone="warn" title="Your account is awaiting verification" className="mb-6">
          We check licence details before clinicians appear to patients. You will be able to accept requests and view shared sessions once verification is complete.
        </Alert>
      )}
      {user?.verification === 'expired' && (
        <Alert tone="danger" title="Your licence has expired" className="mb-6">
          Patients can no longer see or book you. After renewing, update your licence details under Account; FluentAI will check the new licence before your Verified badge returns.
        </Alert>
      )}
      {user?.verification === 'rejected' && (
        <Alert tone="danger" title="Verification was not successful" className="mb-6">Please contact support to review your registration details.</Alert>
      )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard color="#A8650F" icon={<CalendarClock className="h-[18px] w-[18px]" aria-hidden />} label="Requests to review" value={pending.length} foot={pending.length ? 'Waiting for your reply' : 'All caught up'} />
        <StatCard delay={60} color="#0F7880" icon={<Activity className="h-[18px] w-[18px]" aria-hidden />} label="Upcoming consultations" value={upcoming.length} foot="Accepted and scheduled" />
        <StatCard delay={120} color="#2B6CB0" icon={<Users className="h-[18px] w-[18px]" aria-hidden />} label="Patients" value={patients.length} foot="With an active care relationship" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/appointments">Manage</Link>}>Pending requests</SectionTitle>
          {pending.length ? (
            <ul className="divide-y divide-line">
              {pending.slice(0, 5).map((x) => (
                <li key={x.id} className="py-3 text-sm">
                  <p className="font-medium">{x.otherName}</p>
                  <p className="text-ink-muted">{fmtDateTime(x.requestedStart)} · {MODE_LABEL[x.mode]}</p>
                  {x.reason && <p className="mt-1 line-clamp-2 text-ink-soft">“{x.reason}”</p>}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<CalendarClock className="h-5 w-5" aria-hidden />} title="No pending requests">New consultation requests will appear here.</EmptyState>}
        </section>
        <section className="card p-6">
          <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/patients">All patients</Link>}>Patients</SectionTitle>
          {patients.length ? (
            <ul className="divide-y divide-line">
              {patients.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <Link to={`/app/patients/${x.id}`} className="flex items-center justify-between py-3 text-sm hover:text-brand-800">
                    <span className="font-medium">{x.name}</span>
                    <Badge tone={x.sharedSessions ? 'info' : 'muted'}>{x.sharedSessions} shared</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Users className="h-5 w-5" aria-hidden />} title="No patients yet">Patients appear here after you accept a consultation request.</EmptyState>}
        </section>
      </div>
    </>
  );
}

function RoadmapCard({ data }: { data: RoadmapResponse }) {
  const r = data.roadmap;
  const i = r.phases.findIndex((p) => p.id === r.currentPhase);
  const p = r.phases[i]!;
  const next = p.exercises[0]!;
  return (
    <section className="card rise mb-6 flex flex-wrap items-center gap-5 p-5" aria-labelledby="rm">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Route className="h-6 w-6" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-muted">Your fluency roadmap · Stage {i + 1} of {r.phases.length} · {r.progressPct}% complete</p>
        <h2 id="rm" className="mt-0.5 font-semibold">{p.title}</h2>
        <p className="mt-0.5 truncate text-sm text-ink-muted">Next: {next.technique.name} · {ACTIVITY_LABEL[next.activity]} · {next.minutes} min</p>
        <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-brand-500" style={{ width: `${r.progressPct}%` }} /></div>
      </div>
      <Link to="/app/roadmap" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">Open roadmap <ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}
