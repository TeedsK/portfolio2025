import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import Lottie from 'lottie-react';
import { Input, Skeleton } from 'antd';
import './SmartLinkedCode.css';
import { runIconTransfer } from './iconTransfer';

import messyBeard from '@assets/profilePictures/messy/beard.json';
import messyFro from '@assets/profilePictures/messy/fro.json';
import messyGlasses from '@assets/profilePictures/messy/glasses.json';
import messyHair from '@assets/profilePictures/messy/hair.json';
import messyPuff from '@assets/profilePictures/messy/puff.json';
import messyStache from '@assets/profilePictures/messy/stache.json';

import cleanBeard from '@assets/profilePictures/clean/beard.json';
import cleanFro from '@assets/profilePictures/clean/fro.json';
import cleanGlasses from '@assets/profilePictures/clean/glasses.json';
import cleanHair from '@assets/profilePictures/clean/hair.json';
import cleanPuff from '@assets/profilePictures/clean/puff.json';
import cleanStache from '@assets/profilePictures/clean/stache.json';

/** Avatar variants with keys so we can map banner colors deterministically */
const AVATAR_VARIANTS = [
    { key: 'fro', messy: messyFro as any, clean: cleanFro as any },
    { key: 'beard', messy: messyBeard as any, clean: cleanBeard as any },
    { key: 'glasses', messy: messyGlasses as any, clean: cleanGlasses as any },
    { key: 'hair', messy: messyHair as any, clean: cleanHair as any },
    { key: 'puff', messy: messyPuff as any, clean: cleanPuff as any },
    { key: 'stache', messy: messyStache as any, clean: cleanStache as any },
] as const;

const BANNER_COLOR_MAP: Record<(typeof AVATAR_VARIANTS)[number]['key'], string> = {
    fro: '#de9c41',
    beard: '#37bf66',
    glasses: '#c5958b',
    hair: '#dba200',
    puff: '#7c78e3',
    stache: '#e883a1',
};

type ProfileRun = {
    name: string;
    messy: { headline: string; bio: string[] };
    clean: { headline: string; bio: string[] };
};
const PROFILE_RUNS: ProfileRun[] = [
    {
        name: "Bruce Wylis",
        messy: {
            headline: "Business professional who did various roles.",
            bio: [
                "Worked across biz dev and ops.",
                "Sales at ABC; research at DEF.",
                "Business degree."
            ]
        },
        clean: {
            headline: "Strategic Business Leader (MBA) | Revenue Ops, Partnerships & Market Strategy",
            bio: [
                "Operator-partner hybrid with 6+ years aligning go‑to‑market, operations, and client strategy to drive profitable growth.",
                "• ABC Corp: built a partner program that lifted new ARR by 40% and reduced sales cycle by 18%.",
                "• DEF Inc.: led industry landscape research that informed a pricing reset (+15% product adoption) and a 2‑point market share gain.",
                "• Toolkit: Salesforce, HubSpot, SQL for pipeline analytics, Tableau; collaborates tightly with Finance and Product to turn strategy into execution."
            ]
        }
    },
    {
        name: "Samantha Green",
        messy: {
            headline: "Marketing person with lots of experience",
            bio: [
                "Did social, email, and general marketing.",
                "Handled online presence and newsletters.",
                "Creative communicator."
            ]
        },
        clean: {
            headline: "Digital Marketing Strategist | Lifecycle & Growth | Social, Email, Content",
            bio: [
                "Full‑funnel marketer who blends creativity with analytics to turn attention into revenue.",
                "• Social: scaled engagement +50% YoY with audience segmentation and content pillars; improved CTR +28%.",
                "• Email: rebuilt lifecycle flows (welcome, nurture, reactivation) for +30% conversion and +22% retention.",
                "• Stack: GA4, Looker Studio, Klaviyo, Meta/TikTok Ads, basic SQL; fan of rapid A/B testing and message‑market fit."
            ]
        }
    },
    {
        name: "Priya Narayanan",
        messy: {
            headline: "I code websites and apps.",
            bio: [
                "Worked on front end and back end.",
                "Used JavaScript and some databases."
            ]
        },
        clean: {
            headline: "Full‑Stack Software Engineer | TypeScript, React, Node | Scalable Web Apps",
            bio: [
                "Engineer focused on reliable, testable systems and delightful UX.",
                "• Built a React/Node platform serving 1.2M MAU; reduced page load from 3.4s → 1.1s via bundle splitting and memoization.",
                "• Designed event‑driven microservices (Kafka/Postgres) that cut data latency 72% and improved reliability to 99.95%.",
                "• Practices: TDD (Jest/Playwright), CI/CD (GitHub Actions), infra as code (Terraform), observability (OpenTelemetry)."
            ]
        }
    },
    {
        name: "Mateo Álvarez",
        messy: {
            headline: "Data guy who does analysis.",
            bio: [
                "I make dashboards and reports.",
                "Use Python sometimes."
            ]
        },
        clean: {
            headline: "Data Scientist | Causal Inference & ML | Python, SQL, Experimentation",
            bio: [
                "Turns messy data into business decisions with rigorous experimentation.",
                "• Led uplift modeling for CRM offers → +11% incremental revenue, saving $1.2M in discount leakage.",
                "• Designed A/B tests (power, MDE, CUPED) and rolled out a feature store to speed model deployment by 35%.",
                "• Stack: Python (pandas, scikit‑learn, statsmodels), dbt, Airflow, BigQuery; communicates findings in plain language."
            ]
        }
    },
    {
        name: "Jin Park",
        messy: {
            headline: "Product person, worked with teams.",
            bio: [
                "Helped ship features.",
                "Talked to customers sometimes."
            ]
        },
        clean: {
            headline: "Product Manager | B2B SaaS & Platform | Discovery, Roadmaps, Outcomes",
            bio: [
                "Outcome‑oriented PM who pairs deep discovery with crisp execution.",
                "• Launched usage‑based billing that increased NRR to 121% and reduced churn 19%.",
                "• Ran JTBD interviews + analytics to prioritize roadmap; shipped 0‑>1 integrations marketplace (25 partners in 6 months).",
                "• Habits: weekly customer calls, PRDs with clear acceptance criteria, instrumentation by default."
            ]
        }
    },
    {
        name: "Aaliyah Johnson",
        messy: {
            headline: "Designer who makes apps look good.",
            bio: [
                "Worked on wireframes.",
                "Did user tests."
            ]
        },
        clean: {
            headline: "Senior Product Designer | UX Research, IA, and UI Systems | Web & Mobile",
            bio: [
                "Designs accessible, revenue‑driving experiences from insight to pixel‑perfect delivery.",
                "• Reduced checkout drop‑off 27% via UX audits, task flows, and clarity‑first UI patterns.",
                "• Built a design system (Figma, tokens) that cut delivery time 40% and improved consistency across 3 platforms.",
                "• Methods: moderated usability, card sorting, rapid prototyping, WCAG; partners closely with Eng and PM."
            ]
        }
    },
    {
        name: "Luca Rossi",
        messy: {
            headline: "I manage servers and deployments.",
            bio: [
                "Work with clouds.",
                "Make things run."
            ]
        },
        clean: {
            headline: "DevOps / SRE | Cloud Infra, Kubernetes, Reliability Engineering",
            bio: [
                "Keeps systems fast, observable, and cost‑efficient.",
                "• Migrated monolith to k8s with GitOps → deployment time cut 80%, uptime to 99.97%.",
                "• Introduced SLOs/error budgets; MTTR down 54% with on‑call playbooks and chaos drills.",
                "• Stack: AWS (EKS, RDS), Terraform, ArgoCD, Prometheus/Grafana, Loki, Istio; FinOps savings of 22% YoY."
            ]
        }
    },
    {
        name: "Naomi Feldman",
        messy: {
            headline: "Finance background.",
            bio: [
                "Made spreadsheets.",
                "Helped with budgets."
            ]
        },
        clean: {
            headline: "Financial Analyst | FP&A & Strategic Finance | Modeling, Forecasting, KPI Ops",
            bio: [
                "Analyst who translates numbers into narratives leadership can act on.",
                "• Built 3‑statement models and cohort revenue forecasts; improved forecast accuracy from ±12% to ±3%.",
                "• Partnered with GTM to redesign quotas & territories → +9% productivity per rep.",
                "• Tools: Excel (power user), Anaplan, Power BI/Tableau; clear board‑level storytelling."
            ]
        }
    },
    {
        name: "Omar El‑Sayed",
        messy: {
            headline: "Sales professional.",
            bio: [
                "Closed deals and talked to clients.",
                "Did demos."
            ]
        },
        clean: {
            headline: "Enterprise Account Executive | Complex SaaS Sales | New Logos & Expansion",
            bio: [
                "Trusted advisor for technical stakeholders across security, data, and IT.",
                "• 128% average quota attainment, $3.8M new ARR over 2 years; multi‑threaded exec relationships.",
                "• Created ROI/TCO calculators; win rate +14% and sales cycle −21%.",
                "• Methodologies: MEDDICC, SPICED; tight alignment with SEs, CS, and Marketing for land‑and‑expand."
            ]
        }
    },
    {
        name: "Elena Petrova",
        messy: {
            headline: "Project manager, handled tasks.",
            bio: [
                "Organized teams.",
                "Ran meetings."
            ]
        },
        clean: {
            headline: "Project Manager (PMP) | Agile Delivery, PMO, and Stakeholder Management",
            bio: [
                "Delivers complex, cross‑functional programs on time and within scope.",
                "• Managed $4.2M portfolio; improved on‑time delivery from 68% → 95% via risk registers & critical path planning.",
                "• Stood up Scrum ceremonies across 5 squads; cycle time down 33%.",
                "• Tooling: Jira, Confluence, MS Project; communicates clearly from exec updates to sprint demos."
            ]
        }
    },
    {
        name: "Isaac Cohen",
        messy: {
            headline: "IT security person.",
            bio: [
                "Looked at alerts.",
                "Helped with policies."
            ]
        },
        clean: {
            headline: "Cybersecurity Analyst | Threat Detection, Incident Response, GRC",
            bio: [
                "Defends organizations with proactive detection and pragmatic controls.",
                "• Built Sigma rules + tuned SIEM to reduce false positives 45%; mean time to detect down 37%.",
                "• Led incident tabletop exercises; closed audit gaps to align with ISO 27001 & SOC 2.",
                "• Tools: Splunk, Sentinel, CrowdStrike, Nessus; risk‑based approach over checkbox security."
            ]
        }
    },
    {
        name: "Chen Wei",
        messy: {
            headline: "Engineer who works on machines.",
            bio: [
                "Designed parts.",
                "Used CAD."
            ]
        },
        clean: {
            headline: "Mechanical Engineer | CAD/FEA, DFM/DFA | From Prototype to Production",
            bio: [
                "Builds reliable hardware with manufacturability in mind.",
                "• Designed assembly that cut BOM cost 18% and assembly time 25%; validated with FEA and tolerance stack‑ups.",
                "• Partnered with suppliers to move to injection molding; scrap rate reduced 42%.",
                "• Tools: SolidWorks, ANSYS, GD&T; PPAP, APQP, and root‑cause problem solving."
            ]
        }
    },
    {
        name: "Fatima Zahra",
        messy: {
            headline: "Healthcare operations person.",
            bio: [
                "Helped clinics run.",
                "Worked with staff."
            ]
        },
        clean: {
            headline: "Healthcare Operations Manager | Patient Flow, Quality Improvement, Equity",
            bio: [
                "Improves access, experience, and outcomes in busy clinical settings.",
                "• Redesigned intake → wait times −31%, no‑show rate −18% with SMS reminders and walk‑in slots.",
                "• Implemented QI dashboards; HEDIS gap closures +12% and staff satisfaction +9 points.",
                "• Lean/Six Sigma, EPIC, community partnership building; culturally responsive care initiatives."
            ]
        }
    },
    {
        name: "Rafael Sousa",
        messy: {
            headline: "Civil engineer, did construction things.",
            bio: [
                "Worked on roads.",
                "Met deadlines mostly."
            ]
        },
        clean: {
            headline: "Civil Engineer | Transportation & Infrastructure | Project Delivery & Safety",
            bio: [
                "Designs safer, resilient infrastructure within budget and code.",
                "• Managed corridor redesign that cut accidents 22% via traffic calming and signal timing.",
                "• Delivered $12M project under budget (−6%) through value engineering and vendor negotiation.",
                "• Tools: Civil 3D, MicroStation, HCS; environmental permitting and stakeholder outreach."
            ]
        }
    },
    {
        name: "Grace O’Connor",
        messy: {
            headline: "HR person.",
            bio: [
                "Helped hiring.",
                "Did onboarding."
            ]
        },
        clean: {
            headline: "People Ops & HRBP | Talent, Performance, Culture | Startup to Scale",
            bio: [
                "Builds high‑trust teams and scalable people programs.",
                "• Reduced time‑to‑hire from 54 → 27 days; DEI sourcing raised under‑represented hires by 14%.",
                "• Implemented performance cycles with clear rubrics; regrettable attrition −23%.",
                "• Tools: Greenhouse, Lattice, Workday; empathetic coach with data‑driven mindset."
            ]
        }
    },
    {
        name: "Leila Haddad",
        messy: {
            headline: "Nonprofit program person.",
            bio: [
                "Worked with communities.",
                "Ran programs abroad."
            ]
        },
        clean: {
            headline: "Global Health Program Manager | Community‑Led Design | M&E, Partnerships",
            bio: [
                "Coordinates multi‑country programs centered on local leadership and evidence.",
                "• Launched mhGAP‑aligned initiative reaching 8,400 participants; PHQ‑9 improvements of 35% at 6 months.",
                "• Built MEL frameworks (logframes, RCT‑lite where ethical) and partner MOUs; secured $2.1M in grants.",
                "• Cross‑cultural facilitation, safeguarding, and capacity‑building with Ministries of Health."
            ]
        }
    },
    {
        name: "Diego Martín",
        messy: {
            headline: "Customer success rep.",
            bio: [
                "Helped clients after sales.",
                "Answered tickets."
            ]
        },
        clean: {
            headline: "Customer Success Manager | Onboarding, Adoption & Renewals | NRR Focused",
            bio: [
                "Transforms implementations into long‑term value and advocacy.",
                "• Built playbooks that raised product adoption +24% and drove NRR to 118%.",
                "• Turned at‑risk accounts with QBRs and success plans; churn down 32%.",
                "• Gainsight, Zendesk, SQL for health scores; great at translating technical features into outcomes."
            ]
        }
    },
    {
        name: "Zahra Rahman",
        messy: {
            headline: "Researcher in health topics.",
            bio: [
                "Collected data.",
                "Wrote reports."
            ]
        },
        clean: {
            headline: "Public Health Research Scientist | Epidemiology, Mixed Methods, Policy Translation",
            bio: [
                "Investigates inequities and turns findings into actionable policy briefs.",
                "• Led mixed‑methods study (n=1,200 + 40 interviews) on access barriers; recommendations adopted by 3 clinics.",
                "• Managed IRB, REDCap, and reproducible pipelines (R/Quarto); trained community enumerators.",
                "• Publications in peer‑reviewed journals; skilled in causal diagrams, sensitivity analyses."
            ]
        }
    },
    {
        name: "Tomáš Novák",
        messy: {
            headline: "Logistics and supply chain work.",
            bio: [
                "Coordinated shipments.",
                "Worked with vendors."
            ]
        },
        clean: {
            headline: "Supply Chain Manager | S&OP, Inventory Optimization, Global Logistics",
            bio: [
                "Builds resilient, cost‑smart supply chains with data‑driven planning.",
                "• Implemented S&OP and safety‑stock modeling → stockouts −38%, carrying cost −17%.",
                "• Negotiated 3PL contracts saving $840k while improving OTIF from 86% → 97%.",
                "• Tools: SAP, NetSuite, Power BI; playbooks for risk mitigation and dual‑sourcing."
            ]
        }
    },
    {
        name: "Amara Nwosu",
        messy: {
            headline: "Marketing for products.",
            bio: [
                "Wrote some content.",
                "Helped launches."
            ]
        },
        clean: {
            headline: "Product Marketing Manager | Positioning, Launches, Competitive & Sales Enablement",
            bio: [
                "Shapes narratives that win markets and equip sales to close.",
                "• Drove 0‑>1 platform launch (Tier 1) with ICP‑specific messaging; pipeline +38% and win rate +9%.",
                "• Built battlecards and ROI stories; sales ramp time down 30%.",
                "• Research: win/loss, TAM, segmentation; collateral across web, decks, and analyst briefings."
            ]
        }
    },
    {
        name: "Noura Al‑Khaled",
        messy: {
            headline: "Content writer.",
            bio: [
                "Wrote blogs and posts.",
                "Did some editing."
            ]
        },
        clean: {
            headline: "Content Strategist & Writer | B2B SaaS, SEO, Editorial Ops",
            bio: [
                "Turns expertise into high‑ranking, high‑converting content systems.",
                "• Built topic clusters and pillar pages → +120% organic sessions; 14 keywords to page‑1.",
                "• Editorial workflows with briefs, style guides, and QA; reduced revision cycles by 40%.",
                "• Tools: Ahrefs, Search Console, Clearscope; crisp storytelling with technical accuracy."
            ]
        }
    },
    {
        name: "Hiro Tanaka",
        messy: {
            headline: "QA tester of apps.",
            bio: [
                "Found bugs.",
                "Wrote test cases."
            ]
        },
        clean: {
            headline: "QA Engineer | Automation, CI/CD, Quality Strategy | Web & Mobile",
            bio: [
                "Builds quality in from the start with automation and risk‑based testing.",
                "• Stood up Cypress/Appium suites → regression time 6h → 35m; escaped defects −47%.",
                "• Shift‑left with contract tests and CI gates; release confidence up, weekend hotfixes down.",
                "• Tools: Cypress, Playwright, Appium, Postman, GitHub Actions; strong triage & bug taxonomy."
            ]
        }
    },
    {
        name: "Sofia Conti",
        messy: {
            headline: "Operations generalist.",
            bio: [
                "Helped teams run.",
                "Did processes."
            ]
        },
        clean: {
            headline: "Business Operations | Process Design, Analytics, GTM Enablement",
            bio: [
                "Fixes bottlenecks where strategy meets execution.",
                "• Mapped lead‑to‑cash; cut quote approval time 60% and DSO 8 days.",
                "• Created KPI dashboards (cohort, funnel) → weekly rituals that improved accountability.",
                "• Tools: Notion, Asana, Looker, HubSpot; calm operator who documents and ships."
            ]
        }
    },
    {
        name: "Yusuf Demir",
        messy: {
            headline: "Mobile developer.",
            bio: [
                "Built apps for phones.",
                "Published some updates."
            ]
        },
        clean: {
            headline: "Mobile Engineer | iOS & Android | Swift, Kotlin, React Native",
            bio: [
                "Delivers fast, stable mobile experiences users love.",
                "• Refactored networking and caching → crash‑free sessions 99.7%, cold‑start −45%.",
                "• Implemented feature flags and analytics; enabled safe rollouts and data‑driven UX.",
                "• CI with Fastlane; snapshot tests and accessibility by default."
            ]
        }
    },
    {
        name: "Camille Dubois",
        messy: {
            headline: "Customer support person.",
            bio: [
                "Answered questions.",
                "Used help desk."
            ]
        },
        clean: {
            headline: "Support Lead | Help Desk Ops, Knowledge Management, CX Insights",
            bio: [
                "Turns support into a feedback engine for product and growth.",
                "• Built self‑serve KB → ticket deflection +32%; CSAT to 4.8/5.",
                "• QA rubrics and coaching lowered first response from 14h → 2h; FCR +21%.",
                "• Zendesk admin, macros, and tagging taxonomy that feeds product backlog."
            ]
        }
    },
    {
        name: "Daniela Ferreira",
        messy: {
            headline: "Accounting tasks and books.",
            bio: [
                "Handled invoices.",
                "Used spreadsheets."
            ]
        },
        clean: {
            headline: "Senior Accountant | Close & Reporting, Revenue, Controls",
            bio: [
                "Ensures clean closes and audit‑ready financials.",
                "• Shortened month‑end close from 10 → 5 days; automated reconciliations with scripts.",
                "• ASC 606 revenue recognition for subscriptions; eliminated material weaknesses.",
                "• Tools: NetSuite, BlackLine, Excel power queries; partners well with FP&A."
            ]
        }
    },
    {
        name: "Hannah Wright",
        messy: {
            headline: "Teacher and education person.",
            bio: [
                "Taught classes.",
                "Made lesson plans."
            ]
        },
        clean: {
            headline: "Instructional Designer | Learning Science, Curriculum, EdTech",
            bio: [
                "Designs engaging, outcomes‑based learning experiences at scale.",
                "• Rebuilt curriculum using UDL and backward design → assessment mastery +18%.",
                "• Produced microlearning library; course completion +27% across cohorts.",
                "• Tools: Articulate, Canvas, Figma; data‑informed iterations with learner feedback loops."
            ]
        }
    },
    {
        name: "Arjun Mehta",
        messy: {
            headline: "AI stuff.",
            bio: [
                "Played with models.",
                "Read papers."
            ]
        },
        clean: {
            headline: "Machine Learning Engineer | LLM Apps, Retrieval, Evaluation",
            bio: [
                "Ships reliable ML features with observability and guardrails.",
                "• Built RAG pipeline (vector DB + reranking) → answer accuracy +23% on domain evals.",
                "• Implemented offline & online evals (BLEU, semantic similarity, human review) with drift alerts.",
                "• Stack: Python, PyTorch, LangChain/LlamaIndex, Weaviate, FastAPI; privacy‑by‑design."
            ]
        }
    }
];


/** ====== Skeleton measurement with expansion & clamping ====== */
type Shape = { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number };

const SKELETON_EPS = 3; // expand each side by 3px to avoid any thin gaps

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function expandRect(rc: DOMRect, root: DOMRect, eps = SKELETON_EPS) {
    const x = rc.left - root.left - eps;
    const y = rc.top - root.top - eps;
    const w = rc.width + eps * 2;
    const h = rc.height + eps * 2;
    // clamp to root bounds to avoid spill
    const cx = clamp(x, 0, root.width);
    const cy = clamp(y, 0, root.height);
    const cw = clamp(w - (cx - x), 0, root.width - cx);
    const ch = clamp(h - (cy - y), 0, root.height - cy);
    return { x: cx, y: cy, w: cw, h: ch };
}

function rectOf(el: HTMLElement, root: DOMRect, radius?: number): Shape | null {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const { x, y, w, h } = expandRect(r, root);
    return { kind: 'rect', x, y, w, h, r: radius };
}

function lineRectsOf(el: HTMLElement, root: DOMRect): Shape[] {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    return rects
        .filter((rc) => rc.width && rc.height)
        .map((rc) => {
            const { x, y, w, h } = expandRect(rc as DOMRect, root);
            return { kind: 'rect' as const, x, y, w, h, r: 6 };
        });
}

/** ====== Stages ====== */
type Stage = 'prompt-center' | 'docking' | 'loading' | 'reveal-improved' | 'scale-out';

const SmartLinkedCode: React.FC<{ play: boolean }> = ({ play }) => {
    const [runIndex, setRunIndex] = useState(0);
    const [stage, setStage] = useState<Stage>('prompt-center');

    const [variantIdx, setVariantIdx] = useState(0);
    useEffect(() => {
        const idx = Math.floor(Math.random() * AVATAR_VARIANTS.length);
        setVariantIdx(idx);
    }, [runIndex]);

    const variant = AVATAR_VARIANTS[variantIdx];
    const mappedBanner = BANNER_COLOR_MAP[variant.key];
    // Choose a different random color for the original banner to make the switch visible
    const ALL_COLORS = Object.values(BANNER_COLOR_MAP);
    const [originalBanner, setOriginalBanner] = useState<string>(ALL_COLORS[0]);
    useEffect(() => {
        const choices = ALL_COLORS.filter((c) => c !== mappedBanner);
        const pick = choices[Math.floor(Math.random() * choices.length)] ?? mappedBanner;
        setOriginalBanner(pick);
    }, [variantIdx, mappedBanner]);

    const run = PROFILE_RUNS[runIndex];

    const promptRef = useRef<HTMLDivElement>(null);
    const stackRef = useRef<HTMLDivElement>(null);
    const originalLayerRef = useRef<HTMLDivElement>(null);
    const improvedLayerRef = useRef<HTMLDivElement>(null);
    const skeletonRef = useRef<HTMLDivElement>(null);

    /** Typing + Deleting (prompt) */
    const [typedName, setTypedName] = useState('');
    const typedNameRef = useRef(''); useEffect(() => { typedNameRef.current = typedName; }, [typedName]);
    const typingTimeoutRef = useRef<number | null>(null);
    const typingTokenRef = useRef(0);
    const deletingTimeoutRef = useRef<number | null>(null);
    const deletingTokenRef = useRef(0);
    const clearTyping = () => { if (typingTimeoutRef.current != null) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; } };
    const clearDeleting = () => { if (deletingTimeoutRef.current != null) { clearTimeout(deletingTimeoutRef.current); deletingTimeoutRef.current = null; } };

    const [shapes, setShapes] = useState<Shape[]>([]);

    const dockingTlRef = useRef<gsap.core.Timeline | null>(null);
    const loadingTlRef = useRef<gsap.core.Timeline | null>(null);
    const revealTlRef = useRef<gsap.core.Timeline | null>(null);
    const exitTlRef = useRef<gsap.core.Timeline | null>(null);
    const killTl = (ref: React.MutableRefObject<gsap.core.Timeline | null>) => { if (ref.current) { ref.current.kill(); ref.current = null; } };

    const xferCancelRef = useRef<null | (() => void)>(null);

    // --- Stage: prompt-center (typing) ---
    useEffect(() => {
        if (!play || stage !== 'prompt-center') return;

        killTl(dockingTlRef); killTl(loadingTlRef); killTl(revealTlRef); killTl(exitTlRef);
        clearDeleting();
        if (xferCancelRef.current) { xferCancelRef.current(); xferCancelRef.current = null; }

        if (promptRef.current) {
            gsap.set(promptRef.current, { left: '50%', bottom: '50%', xPercent: -50, yPercent: 50 });
        }
        if (stackRef.current) {
            gsap.set(stackRef.current, { scale: 0, opacity: 0, transformOrigin: '50% 50%' });
        }
        if (originalLayerRef.current && improvedLayerRef.current) {
            gsap.set(originalLayerRef.current, { opacity: 1, y: 0 });
            gsap.set(improvedLayerRef.current, { opacity: 0, y: 8 });
        }
        if (skeletonRef.current) {
            gsap.set(skeletonRef.current, { opacity: 0 });
        }

        setTypedName('');
        clearTyping();
        const token = ++typingTokenRef.current;
        const text = run.name;
        let i = 0;
        const nextDelayMs = (ch: string, idx: number) => {
            let ms = 70 + Math.random() * 50;
            if (',.:;!?'.includes(ch)) ms += 80;
            if (ch === ' ') ms += 30 + Math.random() * 30;
            if (idx < 3) ms += 40;
            return ms;
        };
        const step = () => {
            if (typingTokenRef.current !== token) return;
            setTypedName(text.slice(0, i + 1));
            i += 1;
            if (i >= text.length) {
                typingTimeoutRef.current = window.setTimeout(() => {
                    if (typingTokenRef.current !== token) return;
                    setStage('docking');
                }, 800);
                return;
            }
            typingTimeoutRef.current = window.setTimeout(step, nextDelayMs(text[i - 1], i - 1));
        };
        typingTimeoutRef.current = window.setTimeout(step, 240);
        return () => { ++typingTokenRef.current; clearTyping(); };
    }, [play, stage, runIndex]);

    // --- Stage: docking (prompt down; profile in) ---
    useEffect(() => {
        if (!play || stage !== 'docking') return;
        killTl(dockingTlRef);

        const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
        dockingTlRef.current = tl;

        gsap.set(promptRef.current, { left: '50%', bottom: '50%', xPercent: -50, yPercent: 50 });
        gsap.set(stackRef.current, { scale: 0, opacity: 0, transformOrigin: '50% 50%' });

        tl.to(promptRef.current, { left: 12, bottom: 12, xPercent: 0, yPercent: 0, duration: 1.1 }, 0);
        tl.to(stackRef.current, { scale: 1, opacity: 1, duration: 1.1 }, 0);

        tl.addPause('+=2.0', () => setStage('loading'));
        return () => killTl(dockingTlRef);
    }, [play, stage]);

    // --- Measure skeleton shapes with expansion & clamping so they ALWAYS cover content ---
    useLayoutEffect(() => {
        if (stage !== 'loading') return;

        const measure = () => {
            const root = stackRef.current;
            const layer = originalLayerRef.current;
            if (!root || !layer) return;

            const rootRect = root.getBoundingClientRect();
            const next: Shape[] = [];

            const banner = layer.querySelector('.sl-banner') as HTMLElement | null;
            const avatarInner = layer.querySelector('.sl-avatar-inner') as HTMLElement | null;
            const headEl = layer.querySelector('.sl-headline') as HTMLElement | null;
            const bio = layer.querySelector('.sl-bio') as HTMLElement | null;

            if (banner) {
                // Give banner the card's radius so the visual matches the rounded corners
                const rr = rectOf(banner, rootRect, 12);
                if (rr) next.push(rr);
            }
            if (avatarInner) {
                const rr = rectOf(avatarInner, rootRect);
                if (rr) {
                    const rad = Math.min(rr.w, rr.h) / 2;
                    next.push({ ...rr, r: rad });
                }
            }
            if (headEl) {
                const rr = rectOf(headEl, rootRect, 6);
                if (rr) next.push(rr);
            }
            if (bio) {
                const paragraphs = Array.from(bio.querySelectorAll('p')) as HTMLElement[];
                paragraphs.forEach((p) => {
                    const lines = lineRectsOf(p, rootRect);
                    lines.forEach((ln) => next.push(ln));
                });
            }

            setShapes(next);
        };

        // Measure on next frame (after scale/opacity tweens start) and on resize to stay accurate
        const id = requestAnimationFrame(measure);
        const onResize = () => measure();
        window.addEventListener('resize', onResize);
        return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize); };
    }, [stage, runIndex]);

    // --- Stage: loading (skeletons on; shrink; run transfers) ---
    useEffect(() => {
        if (!play || stage !== 'loading') return;
        killTl(loadingTlRef);

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        loadingTlRef.current = tl;

        gsap.set(skeletonRef.current, { opacity: 0 });
        tl.to(skeletonRef.current, { opacity: 1, duration: 0.8 }, 0);
        tl.to(stackRef.current, { scale: 0.7, duration: 0.8 }, 0);
        tl.to(originalLayerRef.current, { opacity: 0.35, duration: 0.8 }, 0);

        // Attach overlay in the right column
        let overlayRoot: HTMLElement | null = stackRef.current?.closest('.projects-right') as HTMLElement | null;
        if (!overlayRoot) overlayRoot = stackRef.current ?? null;

        if (overlayRoot && stackRef.current) {
            const { promise, cancel } = runIconTransfer({
                container: overlayRoot,
                profileEl: stackRef.current,
                mode: 'edge',
                edge: { edgeMargin: 16, topRowY: 16 + 56 / 2, topHorizInset: 28 },
                size: 56,
            });
            xferCancelRef.current = cancel;

            promise.then(() => {
                if (stage === 'loading') setStage('reveal-improved');
            });
        }

        return () => {
            killTl(loadingTlRef);
            if (xferCancelRef.current) { xferCancelRef.current(); xferCancelRef.current = null; }
        };
    }, [play, stage]);

    // --- Stage: reveal-improved (fade in improved; back to full scale) ---
    useEffect(() => {
        if (!play || stage !== 'reveal-improved') return;
        killTl(revealTlRef);

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        revealTlRef.current = tl;

        gsap.set(improvedLayerRef.current, { opacity: 0, y: 8 });

        tl.to(improvedLayerRef.current, { opacity: 1, y: 0, duration: 1.0 }, 0);
        tl.to(skeletonRef.current, { opacity: 0, duration: 1.0 }, 0);
        tl.to(originalLayerRef.current, { opacity: 0, duration: 1.0 }, 0);
        tl.to(stackRef.current, { scale: 1.0, duration: 0.8 }, 0);

        tl.addPause('+=2.0', () => setStage('scale-out'));
        return () => killTl(revealTlRef);
    }, [play, stage]);

    // --- Stage: scale-out (profile out; prompt to center; delete name; restart) ---
    useEffect(() => {
        if (!play || stage !== 'scale-out') return;
        killTl(exitTlRef);
        clearDeleting();

        const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
        exitTlRef.current = tl;

        tl.to(stackRef.current, { scale: 0, opacity: 0, duration: 1.0 }, 0);
        tl.to(promptRef.current, { left: '50%', bottom: '50%', xPercent: -50, yPercent: 50, duration: 1.0 }, 0);

        // Deleting characters while moving back
        const toDelete = typedNameRef.current;
        const perChar = 60;
        const delTotal = Math.max(perChar * toDelete.length, 50);
        const token = ++deletingTokenRef.current;
        const runDelete = (i: number) => {
            if (deletingTokenRef.current !== token) return;
            if (i <= 0) { setTypedName(''); return; }
            setTypedName((prev) => prev.slice(0, -1));
            deletingTimeoutRef.current = window.setTimeout(() => runDelete(i - 1), perChar);
        };
        runDelete(toDelete.length);

        const extra = Math.max(0, delTotal - 1000);
        if (extra > 0) tl.to({}, { duration: extra / 1000 }, '>');
        tl.call(() => {
            setRunIndex((i) => (i + 1) % PROFILE_RUNS.length);
            setStage('prompt-center');
        });

        return () => { killTl(exitTlRef); clearDeleting(); };
    }, [play, stage]);

    // ---------- Render ----------
    const OriginalProfile = useMemo(
        () => (
            <div className="sl-profile" aria-label="Original profile (before)">
                <div className="sl-banner" style={{ backgroundColor: originalBanner }} />
                <div className="sl-avatar">
                    <div className="sl-avatar-ring" />
                    <div className="sl-avatar-inner" aria-hidden>
                        <Lottie animationData={AVATAR_VARIANTS[variantIdx].messy} loop autoplay />
                    </div>
                </div>
                <div className="sl-content">
                    <h4 className="sl-name">{run.name}</h4>
                    <h5 className="sl-headline">{run.messy.headline}</h5>
                    <div className="sl-bio">
                        {run.messy.bio.map((p, i) => (<p key={i}>{p}</p>))}
                    </div>
                </div>
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runIndex, variantIdx, originalBanner]
    );

    const ImprovedProfile = useMemo(
        () => (
            <div className="sl-profile" aria-label="Improved profile (after)">
                <div className="sl-banner" style={{ backgroundColor: mappedBanner }} />
                <div className="sl-avatar">
                    <div className="sl-avatar-ring" />
                    <div className="sl-avatar-inner" aria-hidden>
                        <Lottie animationData={AVATAR_VARIANTS[variantIdx].clean} loop autoplay />
                    </div>
                </div>
                <div className="sl-content">
                    <h4 className="sl-name">{run.name}</h4>
                    <h5 className="sl-headline">{run.clean.headline}</h5>
                    <div className="sl-bio">
                        {run.clean.bio.map((p, i) => (<p key={i}>{p}</p>))}
                    </div>
                </div>
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runIndex, variantIdx, mappedBanner]
    );

    const showStack = stage === 'docking' || stage === 'loading' || stage === 'reveal-improved' || stage === 'scale-out';

    return (
        <div className="sl-root">
            <div className="sl-card" role="group" aria-label="SmartLinked preview">
                <div ref={stackRef} className={`sl-stack ${showStack ? 'is-visible' : ''}`}>
                    <div ref={originalLayerRef} className="sl-layer">{OriginalProfile}</div>
                    <div ref={improvedLayerRef} className="sl-layer">{ImprovedProfile}</div>

                    {(stage === 'loading' || stage === 'reveal-improved') && (
                        <div className="sl-skeletons" ref={skeletonRef} aria-hidden style={{ opacity: 0 }}>
                            {shapes.map((s, idx) => (
                                <div
                                    key={idx}
                                    className="sl-skel-rect"
                                    style={{
                                        left: `${s.x}px`,
                                        top: `${s.y}px`,
                                        width: `${s.w}px`,
                                        height: `${s.h}px`,
                                        borderRadius: s.r !== undefined ? `${s.r}px` : '6px',
                                    }}
                                >
                                    <Skeleton.Button active block />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Prompt */}
                <div className="sl-prompt-float" ref={promptRef} aria-live="polite">
                    <label htmlFor="slPromptInput" className="sl-prompt-label">enter linkedin name</label>
                    <Input id="slPromptInput" value={typedName} readOnly size="large" className="sl-prompt-input" placeholder="Type a name…" />
                </div>
            </div>
        </div>
    );
};

export default SmartLinkedCode;
