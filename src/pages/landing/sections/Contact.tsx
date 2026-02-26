// src/pages/landing/sections/Contact.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../styles/Contact.css';

const CONTACT_API_URL = import.meta.env.VITE_CONTACT_API_URL ?? 'http://localhost:5001/api/contact';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WHITE_THRESHOLD = 245;
const ALPHA_THRESHOLD = 10;

type SocialKey = 'linkedin' | 'github' | 'instagram';
type SubmitStatus = 'idle' | 'sending' | 'success' | 'error';

type ContactFormState = {
    name: string;
    email: string;
    subject: string;
    message: string;
    company: string;
};

const SOCIAL_LINKS: Array<{ key: SocialKey; label: string; href: string; icon: string }> = [
    {
        key: 'linkedin',
        label: 'LinkedIn',
        href: 'http://linkedin.com/in/ttkremer',
        icon: '/images/coding/linkedin_icon.png',
    },
    {
        key: 'github',
        label: 'GitHub',
        href: 'https://github.com/TeedsK',
        icon: '/images/coding/github_icon.png',
    },
    {
        key: 'instagram',
        label: 'Instagram',
        href: 'https://www.instagram.com/theo.kremer',
        icon: '/images/coding/instagram_icon.png',
    },
];

const DEFAULT_ICON_MASKS: Record<SocialKey, string> = {
    linkedin: '/images/coding/linkedin_icon.png',
    github: '/images/coding/github_icon.png',
    instagram: '/images/coding/instagram_icon.png',
};

const Contact: React.FC = () => {
    const seededQuestion = useMemo(() => {
        if (typeof window === 'undefined') return '';
        return new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
    }, []);

    const [formData, setFormData] = useState<ContactFormState>(() => ({
        name: '',
        email: '',
        subject: seededQuestion ? 'Question from portfolio visitor' : '',
        message: seededQuestion,
        company: '',
    }));

    const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
    const [submitMessage, setSubmitMessage] = useState('');
    const [iconMasks, setIconMasks] = useState<Record<SocialKey, string>>(DEFAULT_ICON_MASKS);

    const generateNonWhiteMask = useCallback((src: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const width = img.naturalWidth || img.width;
                    const height = img.naturalHeight || img.height;
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) {
                        resolve(src);
                        return;
                    }

                    ctx.drawImage(img, 0, 0, width, height);
                    const imageData = ctx.getImageData(0, 0, width, height);
                    const data = imageData.data;

                    for (let i = 0; i < data.length; i += 4) {
                        const red = data[i];
                        const green = data[i + 1];
                        const blue = data[i + 2];
                        const alpha = data[i + 3];

                        const isWhite = red >= WHITE_THRESHOLD && green >= WHITE_THRESHOLD && blue >= WHITE_THRESHOLD;
                        const visible = alpha > ALPHA_THRESHOLD && !isWhite;

                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = visible ? 255 : 0;
                    }

                    ctx.putImageData(imageData, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch {
                    resolve(src);
                }
            };

            img.onerror = () => resolve(src);
            img.src = src;
        });
    }, []);

    useEffect(() => {
        let isMounted = true;

        (async () => {
            const generatedMasks = await Promise.all(
                SOCIAL_LINKS.map(async ({ key, icon }) => [key, await generateNonWhiteMask(icon)] as const)
            );

            if (!isMounted) return;

            const nextMasks: Record<SocialKey, string> = { ...DEFAULT_ICON_MASKS };
            generatedMasks.forEach(([key, mask]) => {
                nextMasks[key] = mask;
            });

            setIconMasks(nextMasks);
        })();

        return () => {
            isMounted = false;
        };
    }, [generateNonWhiteMask]);

    const maskStyle = useCallback((maskUrl: string): React.CSSProperties => {
        return {
            WebkitMaskImage: `url(${maskUrl})`,
            maskImage: `url(${maskUrl})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            backgroundColor: '#aeb0b4',
        };
    }, []);

    const handleFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const field = event.target.name as keyof ContactFormState;
        const value = event.target.value;

        setFormData((previous) => ({
            ...previous,
            [field]: value,
        }));

        if (submitStatus !== 'idle') {
            setSubmitStatus('idle');
            setSubmitMessage('');
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = {
            name: formData.name.trim(),
            email: formData.email.trim(),
            subject: formData.subject.trim(),
            message: formData.message.trim(),
            company: formData.company.trim(),
        };

        if (!payload.name || !payload.email || !payload.subject || !payload.message) {
            setSubmitStatus('error');
            setSubmitMessage('Please complete every required field before sending.');
            return;
        }

        if (!EMAIL_REGEX.test(payload.email)) {
            setSubmitStatus('error');
            setSubmitMessage('Please provide a valid email address.');
            return;
        }

        setSubmitStatus('sending');
        setSubmitMessage('Sending your email...');

        try {
            const response = await fetch(CONTACT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responsePayload = (await response.json().catch(() => null)) as
                | { message?: string; error?: string }
                | null;

            if (!response.ok) {
                throw new Error(responsePayload?.error ?? 'The message could not be sent. Please try again.');
            }

            setSubmitStatus('success');
            setSubmitMessage(responsePayload?.message ?? 'Your email was sent successfully.');
            setFormData({
                name: '',
                email: '',
                subject: '',
                message: '',
                company: '',
            });
        } catch (err) {
            setSubmitStatus('error');
            setSubmitMessage(err instanceof Error ? err.message : 'The message could not be sent.');
        }
    };

    return (
        <section id="contact" className="contact-section" aria-labelledby="contact-title">
            <div className="contact-inner">
                <div className="contact-intro">
                    <p className="contact-eyebrow">Let&apos;s build something real.</p>
                    <h2 id="contact-title" className="contact-title">
                        Contact Me
                    </h2>
                    <p className="contact-copy">
                        Reach me directly on social or send a message below. Submissions from this form are sent to
                        <strong> ttkremer@gmail.com</strong>.
                    </p>

                    <div className="contact-socials" aria-label="Social links">
                        {SOCIAL_LINKS.map((social) => (
                            <a
                                key={social.key}
                                className="contact-social"
                                href={social.href}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={social.label}
                                title={social.label}
                            >
                                <img
                                    className="contact-social__img"
                                    src={social.icon}
                                    alt=""
                                    decoding="async"
                                    loading="lazy"
                                    draggable={false}
                                />
                                <span className="contact-social__tint" style={maskStyle(iconMasks[social.key])} aria-hidden />
                            </a>
                        ))}
                    </div>
                </div>

                <div className="contact-form-panel">
                    <h3 className="contact-form-title">Send an Email</h3>

                    <form className="contact-form" onSubmit={handleSubmit} noValidate>
                        <label className="contact-form-field" htmlFor="contact-name">
                            Name
                            <input
                                id="contact-name"
                                name="name"
                                type="text"
                                value={formData.name}
                                onChange={handleFieldChange}
                                required
                                autoComplete="name"
                                maxLength={120}
                            />
                        </label>

                        <label className="contact-form-field" htmlFor="contact-email">
                            Email
                            <input
                                id="contact-email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleFieldChange}
                                required
                                autoComplete="email"
                                maxLength={160}
                            />
                        </label>

                        <label className="contact-form-field" htmlFor="contact-subject">
                            Subject
                            <input
                                id="contact-subject"
                                name="subject"
                                type="text"
                                value={formData.subject}
                                onChange={handleFieldChange}
                                required
                                maxLength={180}
                            />
                        </label>

                        <label className="contact-form-field" htmlFor="contact-message">
                            Message
                            <textarea
                                id="contact-message"
                                name="message"
                                value={formData.message}
                                onChange={handleFieldChange}
                                required
                                maxLength={5000}
                                rows={7}
                            />
                        </label>

                        <label className="contact-form-honeypot" htmlFor="contact-company">
                            Company
                            <input
                                id="contact-company"
                                name="company"
                                type="text"
                                value={formData.company}
                                onChange={handleFieldChange}
                                autoComplete="off"
                                tabIndex={-1}
                            />
                        </label>

                        <button
                            className="contact-submit"
                            type="submit"
                            disabled={submitStatus === 'sending'}
                            aria-busy={submitStatus === 'sending'}
                        >
                            {submitStatus === 'sending' ? 'Sending...' : 'Send Email'}
                        </button>

                        {submitStatus !== 'idle' && (
                            <p
                                className={`contact-status contact-status--${submitStatus}`}
                                role={submitStatus === 'error' ? 'alert' : 'status'}
                            >
                                {submitMessage}
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Contact;
