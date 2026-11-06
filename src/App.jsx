import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { challengeExercises, exercises, moduleById, modules } from './data/curriculum.js';
import { learningLibrary } from './data/library.js';
import CTFPage from './CTFPage.jsx';

const STORAGE_KEY = 'offensive-security-training-progress-v1';
const initialProgress = { pathChosen: false, pathMode: null, selectedModules: [], completedModules: [], completedLessons: [], completedExercises: [], completedLibrary: [], libraryIds: [], quizScores: {}, notes: '', lastModule: modules[0].id, lastActivity: null };

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return initialProgress;
    const completedModules = Array.isArray(saved.completedModules) ? saved.completedModules.filter((id) => modules.some((module) => module.id === id)) : [];
    const completedLessons = Array.isArray(saved.completedLessons) ? saved.completedLessons.filter((id) => modules.some((module) => module.lessons.some((_, index) => `${module.id}-${index}` === id))) : [];
    const completedExercises = Array.isArray(saved.completedExercises) ? saved.completedExercises.filter((id) => exercises.some((exercise) => exercise.id === id)) : [];
    const quizScores = saved.quizScores && typeof saved.quizScores === 'object' && !Array.isArray(saved.quizScores) ? Object.fromEntries(Object.entries(saved.quizScores).filter(([id, score]) => modules.some((module) => module.id === id) && Number.isFinite(score) && score >= 0 && score <= 100)) : {};
    const notes = typeof saved.notes === 'string' ? saved.notes : '';
    const lastActivity = typeof saved.lastActivity === 'string' ? saved.lastActivity : null;
    const hasLegacyActivity = completedModules.length > 0 || completedLessons.length > 0 || completedExercises.length > 0 || Object.keys(quizScores).length > 0 || notes.length > 0 || lastActivity !== null;
    const pathMode = saved.pathMode === 'custom' ? 'custom' : 'fundamentals';
    return {
      pathChosen: typeof saved.pathChosen === 'boolean' ? saved.pathChosen : hasLegacyActivity,
      pathMode,
      selectedModules: Array.isArray(saved.selectedModules) ? [...new Set(saved.selectedModules.filter((id) => modules.some((module) => module.id === id)))] : hasLegacyActivity ? modules.map((module) => module.id) : [],
      completedModules,
      completedLessons,
      completedExercises,
      completedLibrary: Array.isArray(saved.completedLibrary) ? saved.completedLibrary.filter((id) => learningLibrary.some((item) => item.id === id)) : [],
      libraryIds: Array.isArray(saved.libraryIds) ? [...new Set(saved.libraryIds.filter((id) => learningLibrary.some((item) => item.id === id)))] : [],
      quizScores,
      notes,
      lastModule: modules.some((module) => module.id === saved.lastModule) ? saved.lastModule : modules[0].id,
      lastActivity,
    };
  } catch {
    return initialProgress;
  }
}

function App() {
  const [progress, setProgress] = useState(loadProgress);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)), [progress]);
  const update = (change) => setProgress((current) => ({ ...current, ...change, lastActivity: new Date().toISOString() }));
  const setModule = (id) => update({ lastModule: id });
  const toggleModule = (id) => update({ selectedModules: progress.selectedModules.includes(id) ? progress.selectedModules.filter((item) => item !== id) : [...progress.selectedModules, id] });
  const choosePath = (mode) => update({ pathChosen: true, pathMode: mode, selectedModules: mode === 'fundamentals' ? modules.map((module) => module.id) : [] });
  const completeExercise = (id) => update({ completedExercises: [...new Set([...progress.completedExercises, id])] });
  const resetExercise = (id) => update({ completedExercises: progress.completedExercises.filter((item) => item !== id) });
  const toggleLibraryItem = (id) => {
    const libraryIds = progress.libraryIds.includes(id) ? progress.libraryIds.filter((item) => item !== id) : [...progress.libraryIds, id];
    update({ libraryIds, completedLibrary: progress.completedLibrary.filter((item) => libraryIds.includes(item)) });
  };
  const completeLibraryItem = (id) => update({ completedLibrary: [...new Set([...progress.completedLibrary, id])] });

  return (
    <Routes>
      <Route element={<Shell progress={progress} />}>
        <Route index element={progress.pathChosen ? <HomePage progress={progress} /> : <PathStartPage onChoose={choosePath} />} />
        <Route path="path" element={progress.pathChosen ? <PathPage progress={progress} onOpen={setModule} onToggleModule={toggleModule} /> : <PathStartPage onChoose={choosePath} />} />
        <Route path="library" element={<LibraryPage progress={progress} onToggle={toggleLibraryItem} onComplete={completeLibraryItem} />} />
        <Route path="learn/:moduleId" element={<ModulePage progress={progress} update={update} onOpen={setModule} />} />
        <Route path="lab" element={<LabPage progress={progress} onComplete={completeExercise} onReset={resetExercise} />} />
        <Route path="challenges" element={<ChallengesPage progress={progress} onComplete={completeExercise} onReset={resetExercise} />} />
        <Route path="ctf" element={<CTFPage />} />
        <Route path="progress" element={<ProgressPage progress={progress} onReset={() => { if (window.confirm('Reset all learning progress and notes on this browser?')) setProgress(initialProgress); }} />} />
        <Route path="notes" element={<NotesPage progress={progress} update={update} />} />
        <Route path="*" element={<HomePage progress={progress} />} />
      </Route>
    </Routes>
  );
}

const navigation = [
  { to: '/', label: 'Overview', glyph: '⌂', end: true },
  { to: '/path', label: 'Learning path', glyph: '▤' },
  { to: '/library', label: 'Learning library', glyph: '▧' },
  { to: '/lab', label: 'Laboratory', glyph: '▣' },
  { to: '/challenges', label: 'Challenges', glyph: '◇' },
  { to: '/ctf', label: 'CTF playground', glyph: '⚑' },
  { to: '/progress', label: 'Progress', glyph: '▥' },
  { to: '/notes', label: 'My notes', glyph: '✎' },
];

function Shell({ progress }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-mark">H</span><span>H4CKER LAB<small>OFFENSIVE SECURITY</small></span></Link>
      <div className="nav-label">LEARN</div>
      <nav>{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} aria-label={item.label} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span className="nav-glyph">{item.glyph}</span><span className="nav-text">{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><span className="status-dot" /> Offline training mode <small>All lab data is simulated</small></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><span>CYBERSECURITY TRAINING LAB</span><Link to={progress.pathChosen ? '/path' : '/'} className="top-progress">{progress.pathChosen ? progress.pathMode === 'custom' && !progress.selectedModules.length ? 'Manage your learning path' : `${progress.completedModules.filter((id) => progress.selectedModules.includes(id)).length}/${progress.selectedModules.length} modules complete` : 'Choose a learning path'} <span>↗</span></Link></header>
      <div className="page-content"><Outlet /></div>
      <footer>LOCAL TRAINING ENVIRONMENT <span>•</span> SIMULATED DATA ONLY</footer>
    </main>
  </div>;
}

function Eyebrow({ children }) { return <div className="eyebrow">{children}</div>; }
function ProgressBar({ value = 0 }) { return <div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }
function Difficulty({ level }) { return <span className={`difficulty ${level.toLowerCase()}`}>{level}</span>; }

function PathStartPage({ onChoose }) {
  const navigate = useNavigate();
  function choose(mode) { onChoose(mode); navigate('/path'); }
  return <>
    <PageTitle eyebrow="WELCOME · START HERE" title="Choose your learning path" description="Start with a guided beginner path or build one from the topics you care about. No cybersecurity experience is needed." />
    <div className="path-start-grid">
      <article className="path-start-card"><span className="module-number">GUIDED START</span><h2>Offensive Security Fundamentals</h2><p>Follow eight beginner modules covering scope, networking, Linux, reconnaissance, scanning, web security, and assessment.</p><div className="tag-list"><span>Step by step</span><span>Beginner friendly</span></div><button className="button primary" onClick={() => choose('fundamentals')}>Start with fundamentals <span>→</span></button></article>
      <article className="path-start-card"><span className="module-number">MAKE IT YOURS</span><h2>Build my own path</h2><p>Choose the core topics you want to study, then add optional lessons and guided activities from the learning library.</p><div className="tag-list"><span>Pick your topics</span><span>Change it anytime</span></div><button className="button outline" onClick={() => choose('custom')}>Choose my topics <span>→</span></button></article>
    </div>
  </>;
}

function HomePage({ progress }) {
  const pathModules = modules.filter((module) => progress.selectedModules.includes(module.id));
  const pathLibrary = learningLibrary.filter((item) => progress.libraryIds.includes(item.id));
  const done = pathModules.filter((module) => progress.completedModules.includes(module.id)).length + pathLibrary.filter((item) => progress.completedLibrary.includes(item.id)).length;
  const total = pathModules.length + pathLibrary.length;
  const nextModule = pathModules.find((module) => !progress.completedModules.includes(module.id)) || pathModules[0];
  const continueTo = nextModule ? `/learn/${nextModule.id}` : '/path';
  return <>
    <section className="hero-card">
      <div className="hero-copy"><Eyebrow>YOUR TRAINING DASHBOARD</Eyebrow><h1>Learn by thinking<br />like a security analyst.</h1><p>Build practical foundations through short lessons and fictional, hands-on exercises. Everything runs locally in your browser.</p><Link className="button primary" to={continueTo}>{nextModule ? 'Continue learning' : 'View your learning path'} <span>→</span></Link></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-core">⌘<small>LAB</small></div><span className="art-label">SIMULATED<br/>ENVIRONMENT</span></div>
      <div className="hero-foot"><span><i className="status-dot"/> LOCAL-FIRST LEARNING</span><span>{pathModules.length} CORE TOPICS SELECTED</span></div>
    </section>
    <div className="section-heading"><div><Eyebrow>YOUR OVERVIEW</Eyebrow><h2>Training progress</h2></div><Link className="text-link" to="/progress">View details <span>→</span></Link></div>
    <div className="stats-grid"><Stat value={`${Math.round(done / (total || 1) * 100)}%`} label="PATH COMPLETED" detail={`${done} of ${total} selected items`} /><Stat value={progress.completedExercises.length} label="LABS COMPLETED" detail={`${exercises.length} simulated exercises`} /><Stat value={Object.keys(progress.quizScores).length} label="KNOWLEDGE CHECKS" detail="Scores saved locally" /></div>
    <div className="section-heading module-heading"><div><Eyebrow>PICK UP WHERE YOU LEFT OFF</Eyebrow><h2>Learning path</h2></div><Link className="text-link" to="/path">Manage topics <span>→</span></Link></div>
    {pathModules.length ? <div className="module-grid">{pathModules.slice(0, 4).map((module) => <ModuleCard key={module.id} module={module} progress={progress} />)}</div> : <div className="library-empty content-panel">Your custom path is ready for topics. <Link className="text-link" to="/path">Choose core modules</Link> or <Link className="text-link" to="/library">browse the library</Link>.</div>}
  </>;
}

function Stat({ value, label, detail }) { return <div className="stat-card"><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-detail">{detail}</span></div>; }

function ModuleCard({ module, progress, compact = false, onOpen }) {
  const isDone = progress.completedModules.includes(module.id);
  const to = `/learn/${module.id}`;
  return <Link to={to} onClick={() => onOpen?.(module.id)} className={`module-card${compact ? ' compact' : ''}`}>
    <div className="module-card-top"><span className="module-number">{module.number}</span><span className={`module-status${isDone ? ' complete' : ''}`}>{isDone ? '✓ COMPLETE' : '● READY'}</span></div>
    <h3>{module.title}</h3><p>{module.summary}</p>
    <div className="module-card-bottom"><span>{module.duration}</span><span className="arrow">↗</span></div>
  </Link>;
}

function PathPage({ progress, onOpen, onToggleModule }) {
  const selectedModules = modules.filter((module) => progress.selectedModules.includes(module.id));
  const availableModules = modules.filter((module) => !progress.selectedModules.includes(module.id));
  const libraryItems = learningLibrary.filter((item) => progress.libraryIds.includes(item.id));
  const completed = selectedModules.filter((module) => progress.completedModules.includes(module.id)).length + libraryItems.filter((item) => progress.completedLibrary.includes(item.id)).length;
  const total = selectedModules.length + libraryItems.length;
  const fullFundamentals = progress.pathMode === 'fundamentals' && selectedModules.length === modules.length;
  return <>
    <PageTitle eyebrow={progress.pathMode === 'custom' ? 'YOUR CUSTOM PATH' : 'GUIDED LEARNING PATH'} title={fullFundamentals ? 'Offensive Security Fundamentals' : 'My learning path'} description={fullFundamentals ? 'Follow the beginner modules, and add reference-based study units whenever you want.' : 'Choose the core topics that interest you and add optional study units from the learning library.'} />
    <div className="path-progress"><div><span>YOUR LEARNING PATH</span><b>{total ? `${completed} / ${total} items complete` : 'Add topics to get started'}</b></div><ProgressBar value={total ? completed / total * 100 : 0} /></div>
    {selectedModules.length ? <div className="path-list">{selectedModules.map((module) => <div className="path-module-row" key={module.id}><ModuleCard module={module} progress={progress} compact onOpen={onOpen} /><button className="button quiet small" onClick={() => onToggleModule(module.id)}>Remove</button></div>)}</div> : <div className="library-empty content-panel">No core topics selected yet. Add any topics below or browse the learning library.</div>}
    {availableModules.length > 0 && <><div className="section-heading"><div><Eyebrow>CORE TOPICS</Eyebrow><h2>Add topics to your path</h2></div></div><div className="path-topic-grid">{availableModules.map((module) => <article className="path-topic-option" key={module.id}><div className="module-number">{module.number}</div><h3>{module.title}</h3><p>{module.summary}</p><div className="path-topic-footer"><span>{module.duration}</span><button className="button outline small" onClick={() => onToggleModule(module.id)}>Add to path</button></div></article>)}</div></>}
    <div className="section-heading"><div><Eyebrow>ADDED FROM THE LIBRARY</Eyebrow><h2>{libraryItems.length ? 'Your extended study units' : 'Make this path longer'}</h2></div><Link className="text-link" to="/library">Browse library <span>→</span></Link></div>
    {libraryItems.length ? <div className="library-path-list">{libraryItems.map((item) => <Link className="library-path-item" to={`/library#${item.id}`} key={item.id}><span className="library-path-check">{progress.completedLibrary.includes(item.id) ? '✓' : '＋'}</span><span><b>{item.title}</b><small>{item.category} · {formatStudyMinutes(item.minutes)}</small></span><span className="arrow">↗</span></Link>)}</div> : <div className="library-empty content-panel">Add guided reading and practice from the library. Your selected study units will appear here.</div>}
  </>;
}

function LibraryPage({ progress, onToggle, onComplete }) {
  const selected = learningLibrary.filter((item) => progress.libraryIds.includes(item.id));
  return <>
    <PageTitle eyebrow="REFERENCE-BASED STUDY" title="Learning library" description="Browse curated training materials, guided activities, and references. Add any study unit to your personal path." />
    <div className="library-selected-bar">{selected.length} study units added to your path</div>
    {['Core', 'Extended'].map((track) => <section className="library-track" key={track}><div className="section-heading"><div><Eyebrow>{track === 'Core' ? 'BEGINNER CORE' : 'OPTIONAL EXTENSION'}</Eyebrow><h2>{track === 'Core' ? 'Start with the essentials' : 'Explore more security topics'}</h2></div><span>{learningLibrary.filter((item) => item.track === track).length} study units</span></div><div className="library-grid">{learningLibrary.filter((item) => item.track === track).map((item) => { const added = progress.libraryIds.includes(item.id); const completed = progress.completedLibrary.includes(item.id); return <article className="library-card" id={item.id} key={item.id}><div className="library-card-meta"><span>{item.category}</span><span>{formatStudyMinutes(item.minutes)}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="library-activity"><b>GUIDED ACTIVITY</b><span>{item.activity}</span></div><details className="library-sources"><summary>Training material references</summary><ul>{item.sources.map((source) => <li key={source}><code>{source}</code></li>)}</ul></details><div className="library-card-actions"><button className={`button ${added ? 'outline' : 'primary'} small`} onClick={() => onToggle(item.id)}>{added ? 'Remove from path' : 'Add to path'}</button>{added && <button className="button quiet small" onClick={() => onComplete(item.id)} disabled={completed}>{completed ? 'Completed ✓' : 'Mark complete'}</button>}</div></article>; })}</div></section>)}
  </>;
}

function formatStudyMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return [hours && `${hours} hr`, remaining && `${remaining} min`].filter(Boolean).join(' ') || '0 min';
}

function ModulePage({ progress, update, onOpen }) {
  const { moduleId } = useParams();
  const module = moduleById(moduleId);
  const navigate = useNavigate();
  const [selected, setSelected] = useState(0);
  const [choice, setChoice] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { onOpen(module.id); setSelected(0); setChoice(null); setSubmitted(false); }, [module.id]);
  const lessonId = `${module.id}-${selected}`;
  const lessonDone = progress.completedLessons.includes(lessonId);
  const quizCorrect = submitted && choice === module.quiz.answer;
  function submitQuiz() {
    if (choice === null) return;
    setSubmitted(true);
    const score = choice === module.quiz.answer ? 100 : 0;
    update({ quizScores: { ...progress.quizScores, [module.id]: score } });
  }
  function markLesson() {
    update({ completedLessons: [...new Set([...progress.completedLessons, lessonId])] });
    if (selected < module.lessons.length - 1) setSelected(selected + 1);
    else update({ completedModules: [...new Set([...progress.completedModules, module.id])] });
  }
  return <>
    <Link to="/path" className="back-link">← Learning path</Link>
    <div className="module-title-row"><div><Eyebrow>MODULE {module.number} <span>•</span> {module.duration.toUpperCase()}</Eyebrow><h1>{module.title}</h1><p>{module.summary}</p></div><span className={`module-status big${progress.completedModules.includes(module.id) ? ' complete' : ''}`}>{progress.completedModules.includes(module.id) ? '✓ COMPLETE' : '● IN PROGRESS'}</span></div>
    <div className="learning-layout"><div className="lesson-main">
      <section className="content-panel"><Eyebrow>LEARNING OBJECTIVES</Eyebrow><ul className="objectives">{module.objectives.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul></section>
      <section className="content-panel lesson-panel"><div className="lesson-tabs">{module.lessons.map((lesson, index) => <button key={lesson.title} className={selected === index ? 'selected' : ''} onClick={() => { setSelected(index); setChoice(null); setSubmitted(false); }}>{`LESSON 0${index + 1}`} {progress.completedLessons.includes(`${module.id}-${index}`) && <span>✓</span>}</button>)}</div>
        <h2>{module.lessons[selected].title}</h2><p>{module.lessons[selected].body}</p>{module.lessons[selected].visual && <VisualSample sample={module.lessons[selected].visual}/>}<div className="example-box"><span>EXAMPLE</span><p>{module.lessons[selected].example}</p></div>
        <div className="lesson-action"><span>LESSON {selected + 1} OF {module.lessons.length}</span><button className="button primary small" onClick={markLesson}>{lessonDone ? 'Completed ✓' : selected === module.lessons.length - 1 ? 'Complete module' : 'Mark lesson complete'} <span>→</span></button></div>
      </section>
      <section className="content-panel quiz-panel"><Eyebrow>KNOWLEDGE CHECK</Eyebrow><h2>{module.quiz.question}</h2><div className="quiz-options">{module.quiz.choices.map((item, index) => <button key={item} onClick={() => { setChoice(index); setSubmitted(false); }} className={`quiz-option${choice === index ? ' chosen' : ''}${submitted && index === module.quiz.answer ? ' correct' : ''}`}>{String.fromCharCode(65 + index)}<span>{item}</span>{submitted && index === module.quiz.answer && <b>✓</b>}</button>)}</div>{submitted && <div className={`answer-feedback${quizCorrect ? ' good' : ' retry'}`}>{quizCorrect ? 'Correct.' : 'Not quite.'} {module.quiz.explanation}</div>}<button className="button outline" onClick={submitQuiz} disabled={choice === null}>Check answer</button></section>
      <section className="content-panel"><Eyebrow>KEY CONCEPTS</Eyebrow><div className="tag-list">{module.concepts.map((concept) => <span key={concept}>{concept}</span>)}</div><details className="sources"><summary>Material references</summary><ul>{module.source.map((source) => <li key={source}><code>{source}</code></li>)}</ul></details></section>
      <section className="content-panel practice-callout"><div><Eyebrow>PUT IT INTO PRACTICE</Eyebrow><h2>Try this module’s simulated labs</h2><p>Work from supplied fictional evidence. No commands or network requests are run.</p></div><button className="button primary" onClick={() => navigate(`/lab?module=${module.id}`)}>Open lab exercises <span>→</span></button></section>
    </div><aside className="learning-aside"><div className="aside-card"><Eyebrow>MODULE CONTENT</Eyebrow>{module.lessons.map((lesson, index) => <button className={`aside-lesson${index === selected ? ' active' : ''}`} key={lesson.title} onClick={() => { setSelected(index); setChoice(null); setSubmitted(false); }}><span>{progress.completedLessons.includes(`${module.id}-${index}`) ? '✓' : `0${index + 1}`}</span>{lesson.title}</button>)}<div className="aside-divider"/><div className="aside-label">PRACTICALS</div>{module.exercises.map((exercise) => <Link className="aside-exercise" key={exercise.id} to={`/lab?exercise=${exercise.id}`}><Difficulty level={exercise.difficulty}/><span>{exercise.title}</span></Link>)}</div></aside></div>
  </>;
}

function VisualSample({ sample }) {
  return <figure className="visual-sample"><figcaption>{sample.title}</figcaption><table><thead><tr>{sample.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{sample.rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table><small>Fictional teaching example · no system contacted</small></figure>;
}

function PageTitle({ eyebrow, title, description }) { return <div className="page-title"><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1><p>{description}</p></div>; }

function LabPage({ progress, onComplete, onReset }) {
  const [params, setParams] = useSearchParams();
  const moduleId = params.get('module');
  const choices = moduleId ? exercises.filter((exercise) => exercise.moduleId === moduleId) : exercises;
  const groups = modules.map((module) => ({ module, exercises: choices.filter((exercise) => exercise.moduleId === module.id) })).filter((group) => group.exercises.length);
  const [selectedId, setSelectedId] = useState(params.get('exercise') || choices[0]?.id || exercises[0].id);
  useEffect(() => { const requested = params.get('exercise'); const related = params.get('module'); setSelectedId(requested || (related ? exercises.find((item) => item.moduleId === related)?.id : null) || exercises[0].id); }, [params]);
  const active = exercises.find((exercise) => exercise.id === selectedId) || exercises[0];
  return <>
    <PageTitle eyebrow="SIMULATED LABORATORY" title="Practice with fictional evidence" description="Follow the instructions, inspect the supplied output, and verify your answer. The lab is a learning interface, not a shell." />
    <div className="lab-layout"><aside className="lab-list content-panel"><div className="lab-list-heading"><Eyebrow>EXERCISES</Eyebrow><span>{choices.length} AVAILABLE</span></div>{groups.map(({ module, exercises: groupExercises }) => { const finished = groupExercises.filter((exercise) => progress.completedExercises.includes(exercise.id)).length; return <details className="lab-module-group" key={module.id} open={module.id === active.moduleId}><summary><span className="group-chevron">›</span><span className="group-title">{module.number} · {module.title}<small>{finished}/{groupExercises.length} complete</small></span><span className="group-count">{groupExercises.length}</span></summary>{groupExercises.map((exercise) => <button key={exercise.id} className={`lab-choice${active.id === exercise.id ? ' active' : ''}`} onClick={() => { setSelectedId(exercise.id); setParams({ exercise: exercise.id }); }}><span className="lab-choice-check">{progress.completedExercises.includes(exercise.id) ? '✓' : '○'}</span><span className="lab-choice-title">{exercise.title}</span><Difficulty level={exercise.difficulty}/></button>)}</details>; })}</aside><ExerciseRunner key={active.id} exercise={active} completed={progress.completedExercises.includes(active.id)} onComplete={onComplete} onReset={onReset}/></div>
  </>;
}

function ExerciseRunner({ exercise, completed, onComplete, onReset }) {
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState(null);
  function verify() {
    const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9./ -]/g, '').replace(/\s+/g, ' ').trim();
    const typed = normalize(answer);
    const expected = normalize(exercise.answer);
    const words = expected.split(' ').filter((word) => word.length > 1);
    const correct = typed === expected || (words.length > 1 && words.every((word) => typed.includes(word)));
    setResult(correct);
    if (correct) onComplete(exercise.id);
  }
  function reset() { setAnswer(''); setHint(false); setResult(null); onReset(exercise.id); }
  return <section className="content-panel exercise-panel"><div className="exercise-head"><div><Eyebrow>{exercise.moduleTitle.toUpperCase()}</Eyebrow><h2>{exercise.title}</h2></div><Difficulty level={exercise.difficulty}/></div><div className="exercise-objective"><b>OBJECTIVE</b><span>{exercise.objective}</span></div><h3>Instructions</h3><p>{exercise.instructions}</p><div className="terminal"><div className="terminal-head"><span><i/> <i/> <i/></span><b>SIMULATED OUTPUT</b><span>STATIC DATA</span></div><pre>{exercise.output}</pre></div><div className="expected-callout"><b>EXPECTED RESULT</b><span>{exercise.expected}</span></div><label className="answer-label" htmlFor={`exercise-${exercise.id}`}>{exercise.prompt}</label><textarea id={`exercise-${exercise.id}`} value={answer} onChange={(event) => { setAnswer(event.target.value); setResult(null); }} placeholder="Type your answer..." rows={2}/>{hint && <div className="hint-box"><b>HINT</b> {exercise.hint}</div>}{result !== null && <div className={`answer-feedback${result ? ' good' : ' retry'}`}>{result ? `Correct. ${exercise.explanation}` : 'Not quite. Review the supplied output and try again.'}</div>}<div className="exercise-actions"><button className="button primary" onClick={verify} disabled={!answer.trim()}>Check answer <span>→</span></button><button className="button outline" onClick={() => setHint(!hint)}>{hint ? 'Hide hint' : 'Show hint'}</button><button className="button quiet" onClick={reset}>↻ Reset</button>{completed && <span className="completed-label">✓ COMPLETED</span>}</div></section>;
}

function ChallengesPage({ progress, onComplete, onReset }) {
  const difficultyCounts = Object.fromEntries(['Easy', 'Medium', 'High'].map((level) => [level, challengeExercises.filter((exercise) => exercise.difficulty === level).length]));
  return <>
    <div className="challenge-page"><PageTitle eyebrow="APPLIED PRACTICE" title="Challenges" description="Practice with fictional evidence across reconnaissance, networking, Linux, web security, and assessment. Every difficulty includes at least 10 challenges." />
    <div className="challenge-intro"><span className="challenge-icon">◇</span><div><b>Safe, tagged practice</b><p>All answers come from supplied information. No commands or network requests are run.</p></div><div className="challenge-counts">{['Easy', 'Medium', 'High'].map((level) => <span key={level}><Difficulty level={level}/><b>{difficultyCounts[level]}</b></span>)}</div></div>
    <div className="challenge-grid">{challengeExercises.map((exercise, index) => <article className="challenge-card" key={exercise.id}><div className="challenge-card-head"><span>CHALLENGE {String(index + 1).padStart(2, '0')}</span><Difficulty level={exercise.difficulty}/></div><div className="challenge-tags">{exercise.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h2>{exercise.title}</h2><p>{exercise.objective}</p><div className="challenge-module">{exercise.moduleTitle}{progress.completedExercises.includes(exercise.id) && <span>✓ SOLVED</span>}</div><details><summary>Open challenge</summary><div className="challenge-runner"><ExerciseRunner exercise={exercise} completed={progress.completedExercises.includes(exercise.id)} onComplete={onComplete} onReset={onReset}/></div></details></article>)}</div></div>
  </>;
}

function ProgressPage({ progress, onReset }) {
  const selectedModules = modules.filter((module) => progress.selectedModules.includes(module.id));
  const selectedLibrary = learningLibrary.filter((item) => progress.libraryIds.includes(item.id));
  const completed = selectedModules.filter((module) => progress.completedModules.includes(module.id)).length + selectedLibrary.filter((item) => progress.completedLibrary.includes(item.id)).length;
  const total = selectedModules.length + selectedLibrary.length;
  const percent = Math.round(completed / (total || 1) * 100);
  const pathTitle = progress.pathMode === 'fundamentals' && selectedModules.length === modules.length ? 'Offensive Security Fundamentals' : 'Your learning path';
  const levels = ['Easy', 'Medium', 'High'];
  return <>
    <PageTitle eyebrow="YOUR LEARNING RECORD" title="Progress" description="Your learning progress is saved in this browser only." />
    <div className="progress-summary content-panel"><div className="progress-ring"><strong>{percent}%</strong><span>COMPLETE</span></div><div className="progress-summary-copy"><Eyebrow>{pathTitle.toUpperCase()}</Eyebrow><h2>{total ? `${completed} of ${total} selected items completed` : 'Choose topics to begin your path'}</h2><ProgressBar value={percent}/><p>{progress.lastActivity ? `Last activity ${new Date(progress.lastActivity).toLocaleString()}` : <Link className="text-link" to="/path">Choose a learning path <span>→</span></Link>}</p></div></div>
    <div className="section-heading"><div><Eyebrow>ACTIVITY</Eyebrow><h2>Learning record</h2></div></div><div className="stats-grid progress-stats"><Stat value={`${progress.completedExercises.length}/${exercises.length}`} label="LABS COMPLETED" detail={`${challengeExercises.filter((item) => progress.completedExercises.includes(item.id)).length}/${challengeExercises.length} challenges solved`}/><Stat value={Object.keys(progress.quizScores).length} label="QUIZ SCORES" detail="Best score by module"/></div>
    <div className="progress-columns"><section className="content-panel"><Eyebrow>BY MODULE</Eyebrow>{selectedModules.length ? selectedModules.map((module) => <div className="progress-row" key={module.id}><span className={`progress-check${progress.completedModules.includes(module.id) ? ' done' : ''}`}>{progress.completedModules.includes(module.id) ? '✓' : module.number}</span><span>{module.title}<small>{progress.completedLessons.filter((id) => id.startsWith(`${module.id}-`)).length}/{module.lessons.length} lessons · quiz {progress.quizScores[module.id] ?? '—'}</small></span><b>{progress.completedModules.includes(module.id) ? 'Complete' : 'In progress'}</b></div>) : <p className="library-empty">Choose core topics from your learning path to track them here.</p>}{selectedLibrary.length > 0 && <><div className="aside-divider"/><Eyebrow>LIBRARY STUDY UNITS</Eyebrow>{selectedLibrary.map((item) => <div className="progress-row" key={item.id}><span className={`progress-check${progress.completedLibrary.includes(item.id) ? ' done' : ''}`}>{progress.completedLibrary.includes(item.id) ? '✓' : '＋'}</span><span>{item.title}<small>{item.category}</small></span><b>{progress.completedLibrary.includes(item.id) ? 'Complete' : 'In progress'}</b></div>)}</>}</section><section className="content-panel"><Eyebrow>BY DIFFICULTY</Eyebrow>{levels.map((level) => { const all = exercises.filter((exercise) => exercise.difficulty === level); const done = all.filter((exercise) => progress.completedExercises.includes(exercise.id)).length; return <div className="difficulty-row" key={level}><span><Difficulty level={level}/></span><ProgressBar value={done / all.length * 100}/><b>{done}/{all.length}</b></div>; })}<div className="reset-area"><p>Reset all saved progress, quiz scores, and notes in this browser.</p><button className="button outline danger" onClick={onReset}>Reset progress</button></div></section></div>
  </>;
}

function NotesPage({ progress, update }) {
  const [notes, setNotes] = useState(progress.notes);
  useEffect(() => setNotes(progress.notes), [progress.notes]);
  return <>
    <PageTitle eyebrow="PERSONAL STUDY SPACE" title="My notes" description="Notes are stored locally in this browser. Avoid adding passwords, secrets, or sensitive personal information." />
    <section className="content-panel notes-panel"><div className="notes-heading"><div><Eyebrow>LOCAL NOTES</Eyebrow><h2>Learning journal</h2></div><span>PRIVATE TO THIS BROWSER</span></div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => update({ notes })} placeholder="Write down concepts, questions, or things to revisit..." rows={16}/><div className="notes-footer"><span>{notes.length} characters · saved when you leave this field</span><button className="button primary small" onClick={() => update({ notes })}>Save notes <span>✓</span></button></div></section>
  </>;
}

export default App;
