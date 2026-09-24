import React, {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {
  Activity, ArrowDownRight, BarChart3, Clock3, Database, ExternalLink,
  HardDrive, Layers3, RefreshCw, Search, Server, ShieldCheck, Wifi, X
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const SOURCE = "https://www.sih.gov.in/sih2026PS";

const fmt = n => new Intl.NumberFormat("en-IN").format(Number(n || 0));
const pct = (n,d) => d ? ((n/d)*100).toFixed(1) : "0.0";

function Metric({icon,label,value,sub}) {
  return <div className="metric">
    <div className="metric-icon">{icon}</div>
    <div><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>
  </div>
}

function App() {
  const [overview,setOverview]=useState(null), [software,setSoftware]=useState([]);
  const [hardware,setHardware]=useState([]), [all,setAll]=useState([]);
  const [status,setStatus]=useState(null), [tab,setTab]=useState("software");
  const [search,setSearch]=useState(""), [theme,setTheme]=useState("");
  const [loading,setLoading]=useState(true), [syncing,setSyncing]=useState(false);
  const [selected,setSelected]=useState(null);

  async function load() {
    setLoading(true);
    try {
      const [o,s,h,a,st]=await Promise.all([
        fetch(`${API}/api/analytics/overview`).then(r=>r.json()),
        fetch(`${API}/api/rankings/software/least?limit=10`).then(r=>r.json()),
        fetch(`${API}/api/rankings/hardware/least?limit=10`).then(r=>r.json()),
        fetch(`${API}/api/problem-statements?limit=1000`).then(r=>r.json()),
        fetch(`${API}/api/system/status`).then(r=>r.json())
      ]);
      setOverview(o); setSoftware(s.items||[]); setHardware(h.items||[]);
      setAll(a.items||[]); setStatus(st);
    } catch(e) {
      setStatus(x=>({...x||{},status:"offline",last_error:e.message}));
    } finally {setLoading(false)}
  }

  async function sync() {
    setSyncing(true);
    try { await fetch(`${API}/api/sync`,{method:"POST"}) }
    finally { await load(); setSyncing(false) }
  }

  useEffect(()=>{load();const id=setInterval(load,60000);return()=>clearInterval(id)},[]);

  const themes=useMemo(()=>[...new Set(all.map(x=>x.theme).filter(Boolean))].sort(),[all]);
  const filtered=useMemo(()=>all.filter(x=>
    (!search || `${x.ps_id} ${x.title} ${x.organization}`.toLowerCase().includes(search.toLowerCase())) &&
    (!theme || x.theme===theme)
  ).sort((a,b)=>a.submitted-b.submitted),[all,search,theme]);

  const list=tab==="software"?software:hardware;
  const stats=tab==="software"?overview?.software:overview?.hardware;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Activity size={19}/></div>
        <div><b>SIH Monitor</b><span>2026 Submission Intelligence</span></div>
      </div>
      <nav>
        <a className="active"><BarChart3 size={17}/>Dashboard</a>
        <a href="#rankings"><Layers3 size={17}/>Rankings</a>
        <a href="#all"><Database size={17}/>All Problem Statements</a>
      </nav>
      <div className="source-card">
        <div className="source-dot"><Wifi size={14}/></div>
        <div><small>LIVE SOURCE</small><strong>Official SIH Portal</strong></div>
        <a href={SOURCE} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a>
      </div>
    </aside>

    <main>
      <header>
        <div>
          <div className="eyebrow">SMART INDIA HACKATHON · 2026</div>
          <h1>Submission Intelligence</h1>
          <p>Monitor the least-submitted problem statements from the official SIH portal.</p>
        </div>
        <button className="sync-btn" onClick={sync} disabled={syncing}>
          <RefreshCw size={16} className={syncing?"spin":""}/>
          {syncing?"Syncing…":"Sync now"}
        </button>
      </header>

      <section className="status-strip">
        <span className={`status-pill ${status?.status==="live"?"live":"stale"}`}>
          <span className="status-dot"/>
          {status?.status==="live"?"Live data":"Data status: "+(status?.status||"loading")}
        </span>
        <span><Clock3 size={14}/> Last successful update: {status?.last_success?new Date(status.last_success).toLocaleString():"—"}</span>
        <a href={SOURCE} target="_blank" rel="noreferrer">Source: sih.gov.in/sih2026PS <ExternalLink size={12}/></a>
      </section>

      {status?.last_error && status?.status==="stale" &&
        <div className="warning"><ShieldCheck size={17}/>Official source could not be refreshed. Showing the last successful snapshot.</div>}

      <section className="metrics">
        <Metric icon={<Layers3/>} label="Total problem statements" value={fmt(overview?.total)}/>
        <Metric icon={<Server/>} label="Software" value={fmt(overview?.software?.count)} sub={`${fmt(overview?.software?.submissions)} submissions`}/>
        <Metric icon={<HardDrive/>} label="Hardware" value={fmt(overview?.hardware?.count)} sub={`${fmt(overview?.hardware?.submissions)} submissions`}/>
        <Metric icon={<Database/>} label="Total submissions" value={fmt(overview?.total_submissions)}/>
      </section>

      <section id="rankings" className="panel">
        <div className="panel-head">
          <div><span className="section-kicker">LOWEST SUBMISSION COUNT</span><h2>Top 10 least-submitted</h2><p>Software and Hardware are ranked separately.</p></div>
          <div className="tabs">
            <button className={tab==="software"?"selected":""} onClick={()=>setTab("software")}>Software</button>
            <button className={tab==="hardware"?"selected hardware":""} onClick={()=>setTab("hardware")}>Hardware</button>
          </div>
        </div>
        <div className="ranking-summary">
          <div><span>{tab==="software"?"Software":"Hardware"} average</span><b>{fmt(Math.round(stats?.average||0))}</b></div>
          <div><span>Lowest</span><b>{fmt(list[0]?.submitted||0)}</b></div>
          <div><span>10th position</span><b>{fmt(list[list.length-1]?.submitted||0)}</b></div>
        </div>
        <div className="ranking-list">
          {loading?<div className="empty">Loading official data…</div>:list.map((x,i)=>
            <button className="rank-row" key={x.ps_id} onClick={()=>setSelected(x)}>
              <span className={`rank ${i<3?"top":""}`}>{String(i+1).padStart(2,"0")}</span>
              <div className="ps-main"><strong>{x.title}</strong><span>{x.ps_id} · {x.organization}</span></div>
              <span className="theme">{x.theme||"—"}</span>
              <div className="count"><b>{fmt(x.submitted)}</b><span>/ {fmt(x.capacity)}</span><small>{pct(x.submitted,x.capacity)}% filled</small></div>
              <ArrowDownRight size={17}/>
            </button>
          )}
        </div>
      </section>

      <section id="all" className="panel">
        <div className="panel-head compact">
          <div><span className="section-kicker">DATA EXPLORER</span><h2>All problem statements</h2></div>
          <div className="filters">
            <div className="search"><Search size={15}/><input placeholder="Search PS, title, organization…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <select value={theme} onChange={e=>setTheme(e.target.value)}>
              <option value="">All themes</option>{themes.map(t=><option key={t}>{t}</option>)}
            </select>
            {(search||theme)&&<button className="clear" onClick={()=>{setSearch("");setTheme("")}}><X size={15}/></button>}
          </div>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>PS</th><th>Problem statement</th><th>Category</th><th>Theme</th><th>Submitted</th><th>Capacity</th></tr></thead>
          <tbody>{filtered.slice(0,100).map(x=>
            <tr key={x.ps_id} onClick={()=>setSelected(x)}>
              <td><code>{x.ps_id}</code></td><td><b>{x.title}</b><span>{x.organization}</span></td>
              <td><span className={`badge ${x.category.toLowerCase()}`}>{x.category}</span></td>
              <td>{x.theme||"—"}</td><td><strong>{fmt(x.submitted)}</strong></td><td>{fmt(x.capacity)}</td>
            </tr>)}</tbody></table>
          {!filtered.length&&<div className="empty">No problem statements match the current filters.</div>}
        </div>
      </section>
    </main>

    {selected&&<div className="drawer-backdrop" onClick={()=>setSelected(null)}>
      <aside className="drawer" onClick={e=>e.stopPropagation()}>
        <button className="close" onClick={()=>setSelected(null)}><X/></button>
        <span className={`badge ${selected.category.toLowerCase()}`}>{selected.category}</span>
        <code>{selected.ps_id}</code>
        <h2>{selected.title}</h2>
        <p className="org">{selected.organization}</p>
        <div className="big-count"><b>{fmt(selected.submitted)}</b><span>/ {fmt(selected.capacity)} submitted</span></div>
        <div className="progress"><i style={{width:`${Math.min(100,(selected.submitted/selected.capacity)*100)}%`}}/></div>
        <div className="detail-grid">
          <div><small>Filled</small><b>{pct(selected.submitted,selected.capacity)}%</b></div>
          <div><small>Remaining</small><b>{fmt(Math.max(0,selected.capacity-selected.submitted))}</b></div>
          <div><small>Theme</small><b>{selected.theme||"—"}</b></div>
          <div><small>Deadline</small><b>{selected.deadline||"—"}</b></div>
        </div>
        <a className="official" href={SOURCE} target="_blank" rel="noreferrer">Open official SIH portal <ExternalLink size={15}/></a>
      </aside>
    </div>}
  </div>
}

createRoot(document.getElementById("root")).render(<App/>)
