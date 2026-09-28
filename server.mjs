import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@allsuptimeline.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMeNow!";
const APP_NAME = "Allsup Timeline";

let leads = [
  {id:"L1001",firstName:"Sarah",lastName:"Johnson",email:"sarah@example.com",phone:"(314) 555-0142",eligibility:"2027-04-01",advisor:"Unassigned",emailOk:true,smsOk:false,marketingOk:false,interest:[],lastTouch:"Welcome email queued"},
  {id:"L1002",firstName:"Robert",lastName:"Miller",email:"robert@example.com",phone:"(636) 555-0177",eligibility:"2027-01-01",advisor:"Jamie",emailOk:true,smsOk:true,marketingOk:false,interest:["Hospital Indemnity"],lastTouch:"Medicare basics sent"},
  {id:"L1003",firstName:"Linda",lastName:"Davis",email:"linda@example.com",phone:"(314) 555-0199",eligibility:"2026-11-01",advisor:"Chris",emailOk:true,smsOk:true,marketingOk:true,interest:["Dental/Vision"],lastTouch:"Advisor review requested"}
];
let communications = [
  {id:"C1",leadId:"L1002",kind:"Education",channel:"Email",subject:"Medicare basics: Parts A, B, C & D",status:"Sent",at:"2026-09-25"},
  {id:"C2",leadId:"L1003",kind:"Service",channel:"SMS",subject:"Your Medicare review window is approaching",status:"Sent",at:"2026-09-27"}
];
let tasks = [{id:"T1",leadId:"L1002",title:"Follow up on Hospital Indemnity interest",owner:"Jamie",due:"2026-09-30",status:"Open"}];
let campaigns = [
{id:"welcome",days:270,name:"Welcome & reassurance",kind:"Education",channel:"Email",active:true,subject:"Welcome to your Medicare Timeline",body:"A simple introduction to what happens between now and Medicare eligibility."},
{id:"basics",days:180,name:"Medicare fundamentals",kind:"Education",channel:"Email",active:true,subject:"Medicare basics: what to know before enrollment",body:"A short guide to Parts A, B, C and D."},
{id:"gaps",days:120,name:"Optional coverage education",kind:"Marketing",channel:"Email",active:true,subject:"Understanding common gaps around Medicare",body:"Optional coverage education such as hospital indemnity, dental and vision."},
{id:"prepare",days:90,name:"90-day preparation",kind:"Education",channel:"Email",active:true,subject:"Your 90-day Medicare preparation checklist",body:"Simple checklist for documents, providers, prescriptions and questions."},
{id:"advisor",days:60,name:"Advisor introduction",kind:"Service",channel:"Email",active:true,subject:"Your Medicare review window is getting closer",body:"Introduce advisor support and make it easy to request a conversation."},
{id:"enrollment",days:30,name:"Enrollment readiness",kind:"Service",channel:"Email",active:true,subject:"Your Medicare enrollment window is approaching",body:"Final preparation and next actions."}
];
let sessions = new Map();

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const json = (res,code,obj) => { res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((resolve,reject)=>{ let b=""; req.on("data",d=>b+=d); req.on("end",()=>{try{resolve(JSON.parse(b||"{}"))}catch(e){reject(e)}}); req.on("error",reject);});
const daysUntil = d => Math.ceil((new Date(d+"T12:00:00Z")-Date.now())/86400000);
const stageFor = d => { const x=daysUntil(d); return x>180?"6–9 months":x>90?"3–6 months":x>30?"30–90 days":x>0?"Under 30 days":"Eligible now"; };
const token = ()=>crypto.randomBytes(24).toString("hex");
const cookie = req => Object.fromEntries((req.headers.cookie||"").split(";").filter(Boolean).map(x=>x.trim().split("=")));
const authedAdmin = req => sessions.get(cookie(req).admin)?.type==="admin";
const authedLead = req => sessions.get(cookie(req).member)?.leadId;
const engagementScore = l => Math.min(100,28+(l.emailOk?12:0)+(l.smsOk?12:0)+(l.marketingOk?8:0)+((l.interest||[]).length?20:0)+(tasks.some(t=>t.leadId===l.id)?10:0)+Math.min(10,communications.filter(c=>c.leadId===l.id).length*3));
const nextCampaignFor = l => {const d=daysUntil(l.eligibility),sent=l.sentCampaigns||[];return campaigns.filter(c=>c.active&&d<=c.days&&!sent.includes(c.id)&&(c.kind!=="Marketing"||l.marketingOk)).sort((a,b)=>a.days-b.days)[0]||null};
const lessonFor = d => d>180?{tag:"2-minute lesson",title:"What happens before Medicare starts?",body:"A quick orientation to your waiting period, what can wait, and what will matter later."}:d>90?{tag:"Medicare basics",title:"Parts A, B, C and D — without the jargon",body:"Understand the basic building blocks before you start comparing plan choices."}:d>30?{tag:"Prepare",title:"Build your provider and prescription list",body:"A short checklist that makes your eventual plan review faster and more useful."}:{tag:"Enrollment ready",title:"Questions to answer before you choose coverage",body:"A focused guide for the final stretch before your enrollment decision."};
const checklistFor = d => d>180?["Confirm your expected Medicare eligibility date","Keep your email and phone number current","Read one short Medicare lesson when it arrives"]:d>90?["Review Medicare Parts A, B, C and D","Start a list of your doctors and prescriptions","Consider whether you want optional text reminders"]:d>30?["Confirm doctors, prescriptions and preferred pharmacies","Write down questions for your advisor","Review your current coverage and expected transition date"]:["Schedule or confirm your Medicare review","Have your provider and prescription list ready","Review next steps before your eligibility date"];

const styles = `
:root{
  --ink:#0f2340;--ink2:#1a3558;--muted:#66758b;--line:#e4eaf2;--line2:#d8e1ed;
  --paper:#ffffff;--bg:#f5f8fc;--blue:#2356d8;--blue2:#173d9f;--blue3:#edf3ff;
  --green:#0a7b5e;--gold:#94651b;--shadow:0 18px 60px rgba(20,43,78,.10);
  --shadow2:0 6px 24px rgba(20,43,78,.06)
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:
radial-gradient(circle at 76% 9%,rgba(76,118,232,.10),transparent 28%),
linear-gradient(180deg,#fbfdff 0%,#f5f8fc 52%,#fff 100%);-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}.shell{max-width:1220px;margin:auto;padding:0 28px}
.nav{height:82px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(219,227,239,.7)}
.brand{display:flex;gap:12px;align-items:center;font-weight:800;letter-spacing:-.025em}.brand .small{margin-top:1px}
.mark{width:40px;height:40px;border-radius:13px;background:linear-gradient(145deg,#163b96,#4778ef);display:grid;place-items:center;color:#fff;font-weight:900;box-shadow:0 9px 22px rgba(35,86,216,.22)}
.navlinks{display:flex;gap:10px;align-items:center}
.pill,.btn{border:1px solid var(--line2);background:rgba(255,255,255,.9);border-radius:999px;padding:11px 17px;font-weight:750;cursor:pointer;transition:.18s ease;box-shadow:0 1px 0 rgba(15,35,64,.02)}
.pill:hover,.btn:hover{transform:translateY(-1px);box-shadow:0 7px 20px rgba(20,43,78,.09)}
.btn.primary{background:linear-gradient(135deg,var(--blue),#3269ef);color:#fff;border-color:transparent;box-shadow:0 10px 24px rgba(35,86,216,.24)}
.hero{padding:78px 0 54px;display:grid;grid-template-columns:1.1fr .9fr;gap:68px;align-items:center;min-height:620px}
.eyebrow{font-size:12px;letter-spacing:.145em;text-transform:uppercase;font-weight:850;color:#4e70ad}
.hero h1{font-size:66px;line-height:.99;letter-spacing:-.06em;margin:15px 0 22px;max-width:720px}
.lead{font-size:20px;line-height:1.65;color:#5c6d84;max-width:690px}
.trustline{display:flex;gap:18px;flex-wrap:wrap;margin-top:26px;color:#718097;font-size:13px;font-weight:650}
.trustline span:before{content:"✓";display:inline-grid;place-items:center;width:18px;height:18px;margin-right:7px;border-radius:50%;background:#eaf6f1;color:#08795b;font-size:11px}
.heroCard{position:relative;background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(250,252,255,.96));border:1px solid #dfe7f2;border-radius:30px;padding:32px;box-shadow:var(--shadow);overflow:hidden}
.heroCard:before{content:"";position:absolute;right:-75px;top:-85px;width:210px;height:210px;border-radius:50%;background:radial-gradient(circle,rgba(71,120,239,.16),rgba(71,120,239,0) 68%)}
.count{font-size:72px;font-weight:850;letter-spacing:-.07em;line-height:1}.small{font-size:13px;line-height:1.48;color:var(--muted)}
.timeline{display:flex;gap:8px;margin:28px 0 24px}.seg{height:8px;flex:1;border-radius:999px;background:#dfe6f1}.seg.on{background:linear-gradient(90deg,#2b5be0,#4878ef)}
.card{background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:24px;padding:24px;box-shadow:var(--shadow2)}
.card h3{font-size:19px;letter-spacing:-.025em;margin:11px 0 8px}.card p{margin-bottom:0}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.section{padding:34px 0 72px}.section h2{font-size:38px;letter-spacing:-.045em;margin:0 0 18px}
.kicker{color:#45618b;font-weight:760}.metric{font-size:38px;font-weight:840;letter-spacing:-.05em}.topbar{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:24px 0}
.featureStrip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:var(--shadow2)}
.featureItem{background:rgba(255,255,255,.95);padding:22px}.featureItem b{display:block;margin-bottom:5px;font-size:14px}.featureItem .small{font-size:12px}
.journey{margin-top:22px;padding:28px;border:1px solid var(--line);border-radius:26px;background:linear-gradient(180deg,#fff,#fbfcff)}
.journeySteps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:22px}.journeyStep{position:relative;padding-top:20px}.journeyStep:before{content:"";position:absolute;top:0;left:0;width:100%;height:5px;border-radius:99px;background:#dce4ef}.journeyStep.active:before{background:#3768e7}.journeyStep b{display:block;font-size:13px;margin-bottom:4px}.journeyStep span{font-size:12px;color:var(--muted)}
.tablewrap{overflow:auto}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:13px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;white-space:nowrap}.table th{color:#6b778c;font-size:12px;text-transform:uppercase;letter-spacing:.07em}
.badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:#eff3f9;font-size:12px;font-weight:750}.badge.green{background:#e9f8f2;color:#087456}.badge.gold{background:#fff4df;color:#8a5a08}
.form{display:grid;gap:12px}.input,textarea{width:100%;border:1px solid #d8e1ed;border-radius:14px;padding:14px;background:#fff;font:inherit;outline:none}.input:focus,textarea:focus{border-color:#7e9fe8;box-shadow:0 0 0 4px rgba(55,104,231,.08)}
.loginbox{max-width:500px;margin:8vh auto;background:#fff;border:1px solid var(--line);border-radius:28px;padding:36px;box-shadow:var(--shadow)}
.notice{padding:13px 15px;border-radius:13px;background:#f0f5ff;color:#294a8d;font-size:14px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.spacer{height:20px}
.footer{padding:34px 0 44px;color:#7a8799;font-size:12px;border-top:1px solid rgba(228,234,242,.8)}
.progress{height:10px;background:#e8edf5;border-radius:20px;overflow:hidden}.progress>i{display:block;height:100%;background:linear-gradient(90deg,#2457e6,#4d79ee);border-radius:20px}
.dashboardHero{display:grid;grid-template-columns:1.05fr .95fr;gap:20px}.memberHead{padding:30px 0 12px;display:flex;align-items:center;justify-content:space-between;gap:16px}.memberHead h1{font-size:40px;letter-spacing:-.045em;margin:7px 0 0}
.actionCard{background:linear-gradient(145deg,#173f9b,#2f66e3);color:white;border:0}.actionCard .eyebrow,.actionCard .small{color:#dbe7ff}.actionCard .pill{background:#fff;color:#153975;border-color:white}
.miniStat{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}.miniStat:last-child{border-bottom:0}
.checklist{display:grid;gap:10px;margin-top:14px}.check{display:flex;gap:11px;align-items:flex-start;padding:12px;border-radius:14px;background:#f8faff}.checkDot{width:22px;height:22px;border-radius:50%;background:#e7eefc;color:#315fd3;display:grid;place-items:center;font-weight:800;flex:0 0 22px}
.lessonIcon{width:48px;height:48px;border-radius:15px;background:#edf3ff;display:grid;place-items:center;font-size:22px}.advisorCard{display:flex;gap:15px;align-items:center}.avatar{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#dfe9ff,#f0f5ff);color:#20489f;font-weight:850;font-size:18px}.messageItem{padding:14px 0;border-bottom:1px solid var(--line)}.messageItem:last-child{border-bottom:0}
.adminShell{padding-bottom:70px}.adminHero{padding:30px 0 16px}.adminHero h1{font-size:42px;letter-spacing:-.05em;margin:8px 0 0}.metrics4{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.metricCard{padding:20px;border-radius:20px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow2)}.metricCard .metric{font-size:32px}
.adminGrid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.adminGridWide{display:grid;grid-template-columns:1.35fr .65fr;gap:18px}.sectionTitle{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:15px}.sectionTitle h3{margin:0;font-size:20px}.sectionTitle p{margin:3px 0 0}.toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.toolbar .input{max-width:230px;padding:10px 12px}
.score{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#eef3ff;color:#214db8;font-weight:850}.score.hot{background:#e8f7f1;color:#087456}.campaignList{display:grid;gap:12px}.campaignRow{border:1px solid var(--line);border-radius:17px;padding:16px;background:#fff}.campaignTop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.campaignMeta{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.campaignEdit{display:grid;gap:9px;margin-top:12px}.campaignEdit .input{padding:10px 12px}.campaignEdit textarea{min-height:76px;padding:10px 12px}
.opportunity{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}.opportunity:last-child{border-bottom:0}.uploadBox{border:1px dashed #bfcde1;border-radius:18px;padding:18px;background:#f9fbff}.uploadBox input[type=file]{width:100%;margin-bottom:12px}
@media(max-width:900px){.dashboardHero,.adminGrid,.adminGridWide,.metrics4{grid-template-columns:1fr}.memberHead{align-items:flex-start}.memberHead h1{font-size:34px}}
@media(max-width:900px){.hero{grid-template-columns:1fr;padding-top:38px;gap:34px;min-height:0}.hero h1{font-size:47px}.grid3,.grid2,.featureStrip,.journeySteps{grid-template-columns:1fr}.navlinks .hideMobile{display:none}.count{font-size:56px}.shell{padding:0 18px}.heroCard{padding:26px}}
`;

function page(title,body){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${APP_NAME}</title><style>${styles}</style></head><body><div class="shell"><div class="nav"><a class="brand" href="/"><div class="mark">A</div><div>My Medicare Timeline<div class="small">Powered by Allsup</div></div></a><div class="navlinks"><a class="pill hideMobile" href="/education">Medicare education</a><a class="btn primary" href="/login">View my timeline</a></div></div>${body}<div class="footer">My Medicare Timeline · Educational information is not a substitute for plan-specific advice. © 2026</div></div></body></html>`}

function landing(){return page("Welcome",`
<section class="hero">
  <div>
    <div class="eyebrow">Your Medicare journey, made simpler</div>
    <h1>Know what’s next.<br>Feel ready for it.</h1>
    <p class="lead">Your personalized Medicare Timeline turns a long waiting period into a clear path — with timely education, simple reminders and a real advisor when the timing is right.</p>
    <div class="row" style="margin-top:26px">
      <a class="btn primary" href="/login">Open my timeline</a>
      <a class="pill" href="/education">Explore Medicare basics</a>
    </div>
    <div class="trustline">
      <span>No password to remember</span>
      <span>Personalized to your date</span>
      <span>Optional advisor support</span>
    </div>
  </div>
  <div class="heroCard">
    <div class="eyebrow">Your Medicare countdown</div>
    <div style="display:flex;align-items:end;justify-content:space-between;gap:16px;margin-top:14px">
      <div><div class="count">214</div><div class="kicker">days until Medicare</div></div>
      <span class="badge green">On track</span>
    </div>
    <div class="timeline"><div class="seg on"></div><div class="seg on"></div><div class="seg"></div><div class="seg"></div><div class="seg"></div></div>
    <div class="card" style="box-shadow:none">
      <div class="eyebrow">Next milestone</div>
      <h3>Nothing you need to do today.</h3>
      <p class="small">We’ll let you know when it’s time to learn, prepare or speak with an advisor.</p>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="featureStrip">
    <div class="featureItem"><b>Personal timeline</b><span class="small">Built around your expected Medicare eligibility date.</span></div>
    <div class="featureItem"><b>Short education</b><span class="small">Clear guidance delivered when it becomes relevant.</span></div>
    <div class="featureItem"><b>Advisor access</b><span class="small">Human help when you want it — not constant sales pressure.</span></div>
    <div class="featureItem"><b>Coverage education</b><span class="small">Learn about optional products such as hospital indemnity.</span></div>
  </div>
</section>

<section class="section">
  <div class="eyebrow">A journey that changes with you</div>
  <h2 style="margin-top:10px">Nine months should not feel like nine months of waiting.</h2>
  <p class="lead">Your experience evolves as Medicare gets closer. Early on, we keep things light. As enrollment approaches, your checklist, education and access to an advisor become more action-oriented.</p>
  <div class="journey">
    <div class="journeySteps">
      <div class="journeyStep active"><b>6–9 months</b><span>Orientation & reassurance</span></div>
      <div class="journeyStep active"><b>3–6 months</b><span>Medicare fundamentals</span></div>
      <div class="journeyStep"><b>90 days</b><span>Preparation checklist</span></div>
      <div class="journeyStep"><b>60–30 days</b><span>Advisor & plan review</span></div>
      <div class="journeyStep"><b>Enrollment</b><span>Confident next steps</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="grid3">
    <div class="card"><div class="eyebrow">Education</div><h3>Learn only what matters now</h3><p class="small">No giant Medicare encyclopedia on day one. We surface the right concepts at the right point in your journey.</p></div>
    <div class="card"><div class="eyebrow">Protection</div><h3>Understand possible gaps</h3><p class="small">Explore optional coverage such as hospital indemnity, dental and vision when it makes sense for you.</p></div>
    <div class="card"><div class="eyebrow">Support</div><h3>A real person when you’re ready</h3><p class="small">Request help at any time, and your advisor can see where you are in the journey before reaching out.</p></div>
  </div>
</section>
`)}

function education(){return page("Medicare education",`<section class="section"><div class="eyebrow">Education center</div><h2>Medicare, explained clearly.</h2><p class="lead">Short, practical guides timed to the questions people usually have as eligibility gets closer.</p><div class="grid3"><div class="card"><span class="badge">Start here</span><h3>Parts A, B, C and D</h3><p class="small">Understand the building blocks of Medicare and how they fit together.</p></div><div class="card"><span class="badge">Planning</span><h3>Original Medicare vs. Medicare Advantage</h3><p class="small">A neutral overview of the different ways Medicare coverage can be structured.</p></div><div class="card"><span class="badge">Protection</span><h3>What Medicare may not cover</h3><p class="small">Learn about common out-of-pocket gaps and optional products such as hospital indemnity.</p></div></div></section>`)}

function login(message=""){return page("Sign in",`<div class="loginbox"><div class="eyebrow">Secure access</div><h2 style="font-size:34px;letter-spacing:-.04em">Open your Medicare Timeline</h2><p class="small">Enter the email address on your invitation to open this pilot timeline.</p>${message?`<div class="notice">${esc(message)}</div><div class="spacer"></div>`:""}<form class="form" method="post" action="/login"><input class="input" name="email" type="email" required placeholder="Email address"><button class="btn primary">Continue securely</button></form><div class="spacer"></div><a class="small" href="/admin">Staff/admin sign in →</a></div>`)}

function memberPage(lead){
const days=Math.max(0,daysUntil(lead.eligibility)),st=stageFor(lead.eligibility),pct=Math.max(4,Math.min(100,100-(days/270*100))),lesson=lessonFor(days),checks=checklistFor(days),msgs=communications.filter(c=>c.leadId===lead.id).slice(-4).reverse(),advisor=lead.advisor==="Unassigned"?"Medicare Support Team":lead.advisor,initials=advisor.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(),activeIndex=days>180?0:days>90?1:days>60?2:days>30?3:4;
const nextText=days>90?"Nothing required today.":days>30?"Start preparing for your plan review.":"Your enrollment window is getting close.";
const nextBody=days>90?"We’ll keep your education light and timely. Your next milestone will appear here automatically.":days>30?"Your checklist is becoming more action-oriented. This is a good time to gather your doctors, prescriptions and questions.":"Now is a good time to speak with an advisor and make sure your Medicare choices are lined up.";
return page("Your timeline",`<section class="section" style="padding-top:0"><div class="memberHead"><div><div class="eyebrow">Welcome back, ${esc(lead.firstName)}</div><h1>Your Medicare dashboard</h1></div><div class="row"><a class="pill" href="/preferences">Preferences</a><a class="pill" href="/logout">Sign out</a></div></div>
<div class="dashboardHero"><div class="heroCard"><div class="eyebrow">Your Medicare countdown</div><div style="display:flex;justify-content:space-between;align-items:end;gap:14px;margin-top:15px"><div><div class="count">${days}</div><div class="kicker">days until Medicare</div></div><span class="badge green">${esc(st)}</span></div><div class="spacer"></div><div class="progress"><i style="width:${pct}%"></i></div><p class="small">Expected eligibility: <b>${esc(lead.eligibility)}</b></p><div class="journey" style="padding:18px;margin-top:20px"><div class="journeySteps" style="margin-top:0">${["6–9 months","3–6 months","90 days","60–30 days","Enrollment"].map((x,i)=>`<div class="journeyStep ${i<=activeIndex?"active":""}"><b>${x}</b><span>${i<activeIndex?"Completed":i===activeIndex?"You are here":"Ahead"}</span></div>`).join("")}</div></div></div>
<div class="card actionCard"><div class="eyebrow">Your next step</div><h2 style="font-size:30px;letter-spacing:-.04em;margin:12px 0">${nextText}</h2><p class="small" style="font-size:14px">${nextBody}</p><div class="spacer"></div><button class="pill" onclick="requestHelp()">Request advisor help</button></div></div>
<div class="spacer"></div><div class="grid3"><div class="card"><div style="display:flex;gap:14px;align-items:center"><div class="lessonIcon">↗</div><div><div class="eyebrow">${lesson.tag}</div><h3 style="margin:4px 0 0">${lesson.title}</h3></div></div><p class="small">${lesson.body}</p><a class="kicker" href="/education">Read the lesson →</a></div>
<div class="card"><div class="eyebrow">Your checklist</div><div class="checklist">${checks.map((x,i)=>`<div class="check"><div class="checkDot">${i===0?"✓":i+1}</div><div><b style="font-size:13px">${x}</b></div></div>`).join("")}</div></div>
<div class="card"><div class="eyebrow">Your advisor</div><div class="advisorCard" style="margin-top:14px"><div class="avatar">${initials}</div><div><b>${esc(advisor)}</b><div class="small">${lead.advisor==="Unassigned"?"We’ll assign a licensed advisor as your review window gets closer.":"Your assigned Medicare advisor"}</div></div></div><div class="spacer"></div><button class="pill" onclick="requestHelp()">Ask for a call</button></div></div>
<div class="spacer"></div><div class="grid2"><div class="card"><div class="sectionTitle"><div><div class="eyebrow">Coverage education</div><h3>Explore only if it’s useful to you</h3></div></div>
<div class="miniStat"><div><b>Hospital indemnity</b><div class="small">Learn how fixed hospital benefits may work alongside Medicare coverage.</div></div><button class="pill" onclick="interest('Hospital Indemnity')">${lead.interest.includes("Hospital Indemnity")?"Interested ✓":"Learn more"}</button></div>
<div class="miniStat"><div><b>Dental & vision</b><div class="small">Understand common ways people add routine dental and vision benefits.</div></div><button class="pill" onclick="interest('Dental/Vision')">${lead.interest.includes("Dental/Vision")?"Interested ✓":"Learn more"}</button></div>
<div class="miniStat"><div><b>Additional protection</b><div class="small">Ask your advisor about other optional coverage that may fit your situation.</div></div><button class="pill" onclick="interest('Additional Protection')">Ask advisor</button></div></div>
<div class="card"><div class="sectionTitle"><div><div class="eyebrow">Messages & reminders</div><h3>Your recent activity</h3></div><a class="small" href="/preferences">Preferences →</a></div>${msgs.length?msgs.map(c=>`<div class="messageItem"><b style="font-size:14px">${esc(c.subject)}</b><div class="small">${esc(c.channel)} · ${esc(c.kind)} · ${esc(c.at)}</div></div>`).join(""):`<div class="notice">Your first education message will appear here when it becomes relevant.</div>`}<div class="spacer"></div><div class="small">Email ${lead.emailOk?"✓ on":"off"} · SMS ${lead.smsOk?"✓ on":"off"} · Optional product education ${lead.marketingOk?"✓ on":"off"}</div></div></div></section>
<script>async function requestHelp(){await fetch('/api/member/help',{method:'POST'});alert('Thanks — an advisor follow-up has been created.')}async function interest(product){await fetch('/api/member/interest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product})});location.reload()}</script>`)}

function prefs(lead){return page("Preferences",`<div class="loginbox"><div class="eyebrow">Communication preferences</div><h2>Stay in control</h2><p class="small">Service and educational messages are separate from optional marketing about additional insurance products.</p><form class="form" method="post" action="/preferences"><label><input type="checkbox" name="emailOk" ${lead.emailOk?"checked":""}> Email service & education reminders</label><label><input type="checkbox" name="smsOk" ${lead.smsOk?"checked":""}> SMS service reminders (requires documented opt-in)</label><label><input type="checkbox" name="marketingOk" ${lead.marketingOk?"checked":""}> Optional product education & marketing</label><button class="btn primary">Save preferences</button></form><div class="spacer"></div><a class="small" href="/timeline">← Back to timeline</a></div>`)}

function adminLogin(msg=""){return page("Admin",`<div class="loginbox"><div class="eyebrow">Staff access</div><h2>Timeline Admin</h2>${msg?`<div class="notice">${esc(msg)}</div>`:""}<form class="form" method="post" action="/admin/login"><input class="input" type="email" name="email" placeholder="Admin email" required><input class="input" type="password" name="password" placeholder="Password" required><button class="btn primary">Sign in</button></form></div>`)}

function rowLead(l){return `<tr><td><b>${esc(l.firstName+" "+l.lastName)}</b><br><span class="small">${esc(l.email)}</span></td><td>${esc(l.eligibility)}</td><td><span class="badge">${esc(stageFor(l.eligibility))}</span></td><td>${esc(l.advisor)}</td><td>${l.smsOk?'<span class="badge green">Opted in</span>':'<span class="badge">No</span>'}</td><td>${l.marketingOk?'<span class="badge green">Yes</span>':'<span class="badge">No</span>'}</td><td>${esc((l.interest||[]).join(", ")||"—")}</td><td>${esc(l.lastTouch||"—")}</td></tr>`}

function admin(){const interestCount=leads.filter(x=>x.interest?.length).length,near=leads.filter(x=>daysUntil(x.eligibility)<=90).length;return page("Admin console",`<section class="section"><div class="topbar"><div><div class="eyebrow">Operations console</div><h2 style="margin-top:8px">Lead nurture dashboard</h2></div><a class="pill" href="/admin/logout">Sign out</a></div><div class="grid3"><div class="card"><div class="small">Active leads</div><div class="metric">${leads.length}</div></div><div class="card"><div class="small">Within 90 days</div><div class="metric">${near}</div></div><div class="card"><div class="small">Product interest</div><div class="metric">${interestCount}</div></div></div><div class="spacer"></div><div class="grid2"><div class="card"><h3>Import lead list</h3><div class="small">Paste CSV with: firstName,lastName,email,phone,eligibility</div><div class="spacer"></div><form class="form" id="importForm"><textarea id="csv" rows="7" placeholder="firstName,lastName,email,phone,eligibility&#10;Jane,Doe,jane@example.com,3145551212,2027-05-01"></textarea><button class="btn primary">Import leads</button></form><div id="importResult" class="small"></div></div><div class="card"><h3>Nurture engine</h3><p class="small">Eligibility-date milestones determine which educational/service communication becomes due.</p><div class="row"><span class="badge">270d · Welcome</span><span class="badge">180d · Basics</span><span class="badge">90d · Prepare</span><span class="badge">60d · Advisor</span><span class="badge">30d · Enrollment</span></div><div class="spacer"></div><button class="pill" onclick="runDrip()">Run nurture check now</button><div id="dripResult" class="small"></div></div></div><div class="spacer"></div><div class="card"><div class="topbar"><div><h3 style="margin:0">Lead pipeline</h3><div class="small">Lead stage, consent and product interest.</div></div><input class="input" style="max-width:280px" id="search" placeholder="Search leads"></div><div class="tablewrap"><table class="table"><thead><tr><th>Lead</th><th>Eligibility</th><th>Stage</th><th>Advisor</th><th>SMS</th><th>Marketing</th><th>Interest</th><th>Last touch</th></tr></thead><tbody id="leadRows">${leads.map(rowLead).join("")}</tbody></table></div></div><div class="spacer"></div><div class="grid2"><div class="card"><h3>Open advisor tasks</h3>${tasks.map(t=>`<p><b>${esc(t.title)}</b><br><span class="small">${esc(t.owner)} · due ${esc(t.due)} · ${esc(t.status)}</span></p>`).join("")||'<p class="small">No open tasks.</p>'}</div><div class="card"><h3>Recent communications</h3>${communications.slice(-6).reverse().map(c=>`<p><b>${esc(c.subject)}</b><br><span class="small">${esc(c.channel)} · ${esc(c.kind)} · ${esc(c.status)} · ${esc(c.at)}</span></p>`).join("")}</div></div></section><script>const allRows=[...document.querySelectorAll('#leadRows tr')];document.querySelector('#search').oninput=e=>{let q=e.target.value.toLowerCase();allRows.forEach(r=>r.style.display=r.innerText.toLowerCase().includes(q)?'':'none')};document.querySelector('#importForm').onsubmit=async e=>{e.preventDefault();let r=await fetch('/api/admin/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csv:document.querySelector('#csv').value})});let j=await r.json();document.querySelector('#importResult').innerText=j.message||JSON.stringify(j);if(j.ok)setTimeout(()=>location.reload(),700)};async function runDrip(){let r=await fetch('/api/admin/run-drip',{method:'POST'});let j=await r.json();document.querySelector('#dripResult').innerText=j.message}</script>`)}

function sendHtml(res,html){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(html)}
function redirect(res,to,cookieHeader){res.writeHead(302,{Location:to,...(cookieHeader?{"Set-Cookie":cookieHeader}:{})});res.end()}
function formBody(req){return new Promise(resolve=>{let b="";req.on("data",d=>b+=d);req.on("end",()=>resolve(Object.fromEntries(new URLSearchParams(b))))})}

function runNurture(){let sent=0;for(const l of leads){const d=daysUntil(l.eligibility);let subject=null;if(d<=30&&!l._30){subject="Your Medicare enrollment window is approaching";l._30=true}else if(d<=60&&!l._60){subject="Meet your Medicare advisor and prepare your questions";l._60=true}else if(d<=90&&!l._90){subject="90-day Medicare preparation checklist";l._90=true}else if(d<=180&&!l._180){subject="Medicare basics: what to know before enrollment";l._180=true}else if(d<=270&&!l._270){subject="Welcome to your Medicare Timeline";l._270=true}if(subject&&l.emailOk){communications.push({id:token(),leadId:l.id,kind:"Education",channel:"Email",subject,status:"Queued",at:new Date().toISOString().slice(0,10)});l.lastTouch=subject;sent++}}return sent}

const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");
if(req.method==="GET"&&url.pathname==="/api/health")return json(res,200,{ok:true,time:new Date().toISOString()});
if(req.method==="GET"&&url.pathname==="/")return sendHtml(res,landing());
if(req.method==="GET"&&url.pathname==="/education")return sendHtml(res,education());
if(req.method==="GET"&&url.pathname==="/login")return sendHtml(res,login());
if(req.method==="POST"&&url.pathname==="/login"){const b=await formBody(req);const lead=leads.find(x=>x.email.toLowerCase()===String(b.email||"").toLowerCase());if(!lead)return sendHtml(res,login("We couldn’t find that email in the pilot lead list."));const t=token();sessions.set(t,{type:"member",leadId:lead.id});return redirect(res,"/timeline",`member=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`)}
if(req.method==="GET"&&url.pathname==="/timeline"){const id=authedLead(req),lead=leads.find(x=>x.id===id);if(!lead)return redirect(res,"/login");return sendHtml(res,memberPage(lead))}
if(req.method==="GET"&&url.pathname==="/preferences"){const id=authedLead(req),lead=leads.find(x=>x.id===id);if(!lead)return redirect(res,"/login");return sendHtml(res,prefs(lead))}
if(req.method==="POST"&&url.pathname==="/preferences"){const id=authedLead(req),lead=leads.find(x=>x.id===id);if(!lead)return redirect(res,"/login");const b=await formBody(req);lead.emailOk=!!b.emailOk;lead.smsOk=!!b.smsOk;lead.marketingOk=!!b.marketingOk;return redirect(res,"/timeline")}
if(req.method==="GET"&&url.pathname==="/logout")return redirect(res,"/","member=; Path=/; Max-Age=0");
if(req.method==="GET"&&url.pathname==="/admin")return authedAdmin(req)?sendHtml(res,admin()):sendHtml(res,adminLogin());
if(req.method==="POST"&&url.pathname==="/admin/login"){const b=await formBody(req);if(b.email!==ADMIN_EMAIL||b.password!==ADMIN_PASSWORD)return sendHtml(res,adminLogin("That sign-in did not match the configured admin credentials."));const t=token();sessions.set(t,{type:"admin"});return redirect(res,"/admin",`admin=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`)}
if(req.method==="GET"&&url.pathname==="/admin/logout")return redirect(res,"/admin","admin=; Path=/; Max-Age=0");
if(req.method==="POST"&&url.pathname==="/api/member/help"){const id=authedLead(req);if(!id)return json(res,401,{ok:false});tasks.push({id:token(),leadId:id,title:"Consumer requested Medicare advisor help",owner:"Unassigned",due:new Date(Date.now()+86400000).toISOString().slice(0,10),status:"Open"});return json(res,200,{ok:true})}
if(req.method==="POST"&&url.pathname==="/api/member/interest"){const id=authedLead(req);if(!id)return json(res,401,{ok:false});const b=await readBody(req),l=leads.find(x=>x.id===id);if(l&&!l.interest.includes(b.product))l.interest.push(b.product);tasks.push({id:token(),leadId:id,title:`Follow up on ${b.product} interest`,owner:l?.advisor||"Unassigned",due:new Date(Date.now()+172800000).toISOString().slice(0,10),status:"Open"});return json(res,200,{ok:true})}
if(req.method==="POST"&&url.pathname==="/api/admin/run-drip"){if(!authedAdmin(req))return json(res,401,{ok:false});const n=runNurture();return json(res,200,{ok:true,message:`Nurture check complete. ${n} communication(s) queued.`})}
if(req.method==="POST"&&url.pathname==="/api/admin/import"){if(!authedAdmin(req))return json(res,401,{ok:false});const b=await readBody(req),lines=String(b.csv||"").trim().split(/\r?\n/).filter(Boolean);if(lines.length<2)return json(res,400,{ok:false,message:"Add a header row and at least one lead."});const head=lines.shift().split(",").map(x=>x.trim());let added=0,skipped=0;for(const line of lines){const vals=line.split(",").map(x=>x.trim()),o=Object.fromEntries(head.map((h,i)=>[h,vals[i]||""]));if(!o.email||!o.eligibility||leads.some(x=>x.email.toLowerCase()===o.email.toLowerCase())){skipped++;continue}leads.push({id:"L"+Date.now()+added,firstName:o.firstName||"",lastName:o.lastName||"",email:o.email,phone:o.phone||"",eligibility:o.eligibility,advisor:"Unassigned",emailOk:true,smsOk:false,marketingOk:false,interest:[],lastTouch:"Imported"});added++}return json(res,200,{ok:true,message:`Imported ${added} lead(s); skipped ${skipped} duplicate/invalid row(s).`})}
return json(res,404,{error:"Not found"})}catch(e){console.error(e);json(res,500,{error:"Server error"})}});
server.listen(PORT,"0.0.0.0",()=>console.log(`Allsup Timeline listening on ${PORT}`));
