// src/pages/landing/sections/Contact.tsx
import React from 'react';
import '../styles/Contact.css';

const Contact: React.FC = () => {
    return (
        <section id="contact" className="contact-section" aria-labelledby="contact-title">
            <div className="contact-inner">
                <p className="contact-eyebrow">Let's build something real.</p>
                <h2 id="contact-title" className="contact-title">
                    Contact
                </h2>
                <p className="contact-copy">
                    I am open to product-focused engineering opportunities, consulting, and ambitious side projects.
                    Reach out and I will get back to you.
                </p>
                <div className="contact-actions">
                    <a
                        className="contact-btn contact-btn-primary"
                        href="https://linkedin.com/in/ttkremer"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Message on LinkedIn
                    </a>
                    <a
                        className="contact-btn contact-btn-secondary"
                        href="https://github.com/TeedsK"
                        target="_blank"
                        rel="noreferrer"
                    >
                        View GitHub
                    </a>
                </div>
            </div>
        </section>
    );
};

export default Contact;
