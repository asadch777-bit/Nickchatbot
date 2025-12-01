'use client';

import { useState, useEffect } from 'react';
import Chatbot from '@/components/Chatbot';
import styles from './widget.module.css';

export default function Widget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Check if device is mobile
        const checkMobile = () => {
            // TODO css media query
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className={styles.widgetContainer}>
            {/* Toggle button - always visible */}
            <button
                className={`${styles.toggleButton} ${isOpen ? styles.hidden : ''}`}
                onClick={toggleChat}
                aria-label="Open chat"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>

            {/* Chatbot container - conditionally visible */}
            <div className={`${styles.chatContainer} ${isOpen ? styles.open : ''}`}>
                <div className={styles.chatContent}>
                    <Chatbot />
                    <button
                        className={styles.closeButton}
                        onClick={toggleChat}
                        aria-label="Close chat"
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            {/* Backdrop for mobile */}
            {isMobile && isOpen && (
                <div
                    className={styles.backdrop}
                    onClick={toggleChat}
                ></div>
            )}
        </div>
    );
}
