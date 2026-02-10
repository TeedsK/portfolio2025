// src/components/header/ddData.ts
export type DDItem = {
    label: string;
    href: string;
    sub: string;
    img: string;
    desc: string;
};

export const EXPERIENCE_ITEMS: DDItem[] = [
    {
        label: 'Goldman Sachs',
        href: '/experience/goldman-sachs',
        sub: 'Machine Learning, Full-Stack',
        img: '/images/work-experience/goldman_sachs.png',
        desc:
            '2x Summer Analyst building LLM agents and webpages.'
    },
    {
        label: 'University of Utah',
        href: '/experience/university-of-utah',
        sub: 'Teaching & Research',
        img: '/images/work-experience/university_of_utah.png',
        desc:
            'Mentored students accross 5+ unique CS courses.'
    },
    {
        label: 'Rodina Consulting',
        href: '/experience/rodina-consulting',
        sub: 'Middleware Software Dev',
        img: '/images/work-experience/rodina_consulting.png',
        desc:
            'Built data transfer system and invoice generation.'
    },
    {
        label: 'Tippett Studio',
        href: '/experience/tippett-studio',
        sub: 'Stagehand',
        img: '/images/work-experience/tippett_studios.png',
        desc:
            'Created, set up, and assisted with stop motion shoots.'
    },
];

export const PROJECT_ITEMS: DDItem[] = [
    {
        label: 'SmartLinked',
        href: '/projects/smartlinked',
        sub: 'AI LinkedIn Toolkit',
        img: '/images/icons/smartLinkedLogo.svg',
        desc:
            'Profile content revisions, insights, and cold messages.'
    },
    {
        label: 'Kudo Tools',
        href: '/projects/kudo-tools',
        sub: 'Resell Ecommerce Platform',
        img: '/images/icons/kudotools.png',
        desc:
            'Utility bundle for improving resell transaction speed.'
    },
    {
        label: 'HoloClean',
        href: '/projects/holoclean',
        sub: 'Probabilistic Data Repair',
        img: '/images/icons/holoclean.png',
        desc:
            'Machine learning repair, fixing errors in data tables.'
    },
    {
        label: 'Frontend Work',
        href: '/projects/portfolios',
        sub: "Webpages I've Built",
        img: '/images/icons/frontend.png',
        desc:
            "5+ webpages I've built and my design growth.",
    },
    {
        label: 'Desktop Applications',
        href: '/projects/stackchan',
        sub: 'Windows & Mac Apps',
        img: '/images/icons/desktop.png',
        desc:
            "10+ desktop apps I've built and my framework expertise."
    },
];
