// src/pages/landing/sections/AboutMe.tsx
import React, { useRef } from 'react';
import '../styles/AboutMe.css';

type NodeId = 'stop-motions' | 'skiing' | 'weightlifting' | 'video-games';

type TopicNode = {
    id: NodeId;
    title: string;
    copy: string;
};

const TOPIC_NODES: TopicNode[] = [
    {
        id: 'stop-motions',
        title: 'stop motions',
        copy: 'Frame-by-frame storytelling trained my patience and detail-first creativity.',
    },
    {
        id: 'skiing',
        title: 'skiing',
        copy: 'Powder days reset my brain and keep me sharp through long build cycles.',
    },
    {
        id: 'weightlifting',
        title: 'weightlifting',
        copy: 'Lifting gives me structure, consistency, and competitive energy.',
    },
    {
        id: 'video-games',
        title: 'video games',
        copy: 'Competitive games taught me systems thinking and rapid decision making.',
    },
];

const AboutMe: React.FC = () => {
    const sectionRef = useRef<HTMLElement>(null);

    return (
        <section id="about-me" className="about-section" aria-labelledby="about-me-title" ref={sectionRef}>
            <div className="about-inner">
                <div className="about-web-canvas">
                    <div className="about-orbit" aria-hidden="true" />

                    <figure className="about-image-node about-orbit-node about-image-ski" aria-hidden="true">
                        <img src="/images/about_me/ski.png" alt="" loading="lazy" />
                    </figure>

                    {TOPIC_NODES.map((node) => (
                        <article
                            key={node.id}
                            className={`about-node-card about-orbit-node about-node-${node.id}`}
                            aria-labelledby={`about-${node.id}-title`}
                        >
                            <h3 id={`about-${node.id}-title`} className="about-node-title">
                                {node.title}
                            </h3>
                            <p className="about-node-copy">{node.copy}</p>
                        </article>
                    ))}

                    <div className="about-node-center">
                        <h2 id="about-me-title" className="about-title">
                            About Me
                        </h2>
                        <p className="about-intro">
                            I started coding at 13 by learning HTML through freeCodeCamp, and by 14 during my
                            freshman year of high school I was already building products. I studied Computer Science at
                            the University of Utah, where I also discovered how much I love skiing. I love gym
                            culture, I am a huge San Jose Sharks fan, and I created stop motions all through
                            elementary and middle school as my creative outlet before that creativity shifted into
                            coding.
                        </p>
                    </div>

                    <figure className="about-image-node about-orbit-node about-image-normal" aria-hidden="true">
                        <img src="/images/about_me/normal.png" alt="" loading="lazy" />
                    </figure>
                </div>
            </div>
        </section>
    );
};

export default AboutMe;
