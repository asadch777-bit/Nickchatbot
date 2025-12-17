'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import styles from './Chatbot.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  options?: Array<{
    label: string;
    value: string;
    action?: string;
  }>;
  showOptions?: boolean;
}

interface ChatbotProps {
  onClose?: () => void;
}

export default function Chatbot({ onClose }: ChatbotProps = {}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm NICK, your intelligent Gtech product assistant. I can help you with product information, pricing, sales, ordering, and more. All information is fetched live from our website. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (date: Date): string => {
    if (!isMounted) {
      // Return a placeholder during SSR to avoid hydration mismatch
      return '';
    }
    // Use explicit locale and format to ensure consistency
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const convertLinksToHTML = (text: string): string => {
    if (!text) return '';
    
    // Escape HTML to prevent XSS
    const escapeHtml = (str: string) => {
      const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return str.replace(/[&<>"']/g, (m) => map[m]);
    };

    // Step 1: Preserve existing HTML anchor tags and br tags by replacing them with placeholders
    const existingLinks: Array<{ placeholder: string; html: string }> = [];
    let existingLinkIndex = 0;
    
    // Preserve <a> tags
    let processedText = text.replace(/<a\s+([^>]*?)>(.*?)<\/a>/gi, (match) => {
      const placeholder = `__EXISTING_LINK_${existingLinkIndex++}__`;
      existingLinks.push({
        placeholder,
        html: match, // Preserve the original HTML exactly
      });
      return placeholder;
    });

    // Preserve <br> and <br/> tags
    const existingBreaks: Array<{ placeholder: string; html: string }> = [];
    let breakIndex = 0;
    
    processedText = processedText.replace(/<br\s*\/?>/gi, (match) => {
      const placeholder = `__BR_TAG_${breakIndex++}__`;
      existingBreaks.push({
        placeholder,
        html: '<br>', // Normalize to <br>
      });
      return placeholder;
    });

    // Convert markdown bold **text** to HTML <strong>text</strong>
    processedText = processedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Preserve <strong> tags (from markdown conversion or already existing)
    const existingBold: Array<{ placeholder: string; html: string }> = [];
    let boldIndex = 0;
    
    processedText = processedText.replace(/<strong>(.*?)<\/strong>/gi, (match, content) => {
      const placeholder = `__BOLD_TAG_${boldIndex++}__`;
      existingBold.push({
        placeholder,
        html: `<strong>${content}</strong>`, // Preserve with content
      });
      return placeholder;
    });

    // Step 2: Replace markdown links [text](url) with placeholders
    const markdownLinkPlaceholders: Array<{ placeholder: string; html: string }> = [];
    let markdownIndex = 0;
    
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      const placeholder = `__MARKDOWN_LINK_${markdownIndex++}__`;
      markdownLinkPlaceholders.push({
        placeholder,
        html: `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${escapeHtml(linkText)}</a>`,
      });
      return placeholder;
    });
    
    // Step 3: Split by placeholders and escape text parts only
    const parts: Array<{ type: 'text' | 'placeholder'; content: string }> = [];
    let lastIndex = 0;
    const placeholderRegex = /__(?:EXISTING|MARKDOWN)_LINK_\d+__|__BR_TAG_\d+__|__BOLD_TAG_\d+__/g;
    let match;
    
    while ((match = placeholderRegex.exec(processedText)) !== null) {
      // Add text before placeholder (escape it)
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: escapeHtml(processedText.substring(lastIndex, match.index)),
        });
      }
      // Add placeholder (don't escape)
      parts.push({
        type: 'placeholder',
        content: match[0],
      });
      lastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (lastIndex < processedText.length) {
      parts.push({
        type: 'text',
        content: escapeHtml(processedText.substring(lastIndex)),
      });
    }
    
    // Rebuild HTML from parts
    let html = parts.map(part => part.content).join('');
    
    // Step 4: Convert plain URLs to clickable links (only process text parts)
    // Match URLs including those at end of sentences with punctuation
    const urlPattern = /https?:\/\/[^\s<>"']+/g; 
    html = html.replace(urlPattern, (matched) => {
      // Skip if this looks like part of a placeholder
      if (matched.includes('__LINK_') || matched.includes('__MARKDOWN_') || matched.includes('__EXISTING_')) {
        return matched;
      }
      
      // Remove trailing punctuation that shouldn't be part of the URL
      let cleanUrl = matched;
      let trailing = '';
      const trailingPunct = /[.,!?;:]$/;
      if (trailingPunct.test(cleanUrl) && !cleanUrl.endsWith('/')) {
        trailing = cleanUrl.slice(-1);
        cleanUrl = cleanUrl.slice(0, -1);
      }
      
      // Unescape the URL for the href attribute
      const unescapedUrl = cleanUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      return `<a href="${unescapedUrl}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${cleanUrl}</a>${trailing}`;
    });
    
    // Step 5: Replace markdown link placeholders with actual HTML links
    markdownLinkPlaceholders.forEach(({ placeholder, html: linkHtml }) => {
      html = html.replace(placeholder, linkHtml);
    });
    
    // Step 6: Replace existing link placeholders back to original HTML
    existingLinks.forEach(({ placeholder, html: linkHtml }) => {
      html = html.replace(placeholder, linkHtml);
    });

    // Step 7: Replace break placeholders back to <br> tags
    existingBreaks.forEach(({ placeholder, html: breakHtml }) => {
      html = html.replace(placeholder, breakHtml);
    });

    // Step 8: Replace bold placeholders back to <strong> tags
    existingBold.forEach(({ placeholder, html: boldHtml }) => {
      html = html.replace(placeholder, boldHtml);
    });

    // Step 9: Replace newlines with <br> tags (only if not already a break)
    html = html.replace(/\n/g, '<br>');

    return html;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const messageContent = input.trim();
    const userMessage: Message = {
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageContent, sessionId }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response || 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        options: data.options,
        showOptions: data.showOptions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOptionClick = async (option: { label: string; value: string; action?: string }) => {
    if (!option.action) return;

    // Add user's selection as a message
    const userMessage: Message = {
      role: 'user',
      content: option.label,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: `action:${option.action}`, sessionId }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response || 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
        options: data.options,
        showOptions: data.showOptions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={styles.chatbotContainer}>
      
      <div className={styles.chatbotHeader}>
        <div className={styles.headerContent}>
          <div className={styles.avatar}>
            <Image 
              src="/NickP1.png" 
              alt="Nick Avatar" 
              width={60}
              height={60}
              className={styles.avatarImage}
              priority
            />
          </div>
          <div>
            <h2>NICK</h2>
            <p>Gtech Product Assistant</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className={styles.statusIndicator}>
            <span className={styles.statusDot}></span>
            <span>Online</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className={styles.closeButton}
              aria-label="Close chat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className={styles.messagesContainer}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={`${styles.message} ${
              message.role === 'user' ? styles.userMessage : styles.assistantMessage
            }`}
          >
            <div className={styles.messageContent}>
              <div
                className={styles.messageText}
                dangerouslySetInnerHTML={{ __html: convertLinksToHTML(message.content) }}
              />
              {message.showOptions && message.options && (
                <div className={styles.messageOptions}>
                  {message.options.map((option, idx) => (
                    <button
                      key={idx}
                      className={styles.optionButton}
                      onClick={() => handleOptionClick(option)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.messageMeta}>
                <span className={styles.messageTime}>
                  {formatTime(message.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            <div className={styles.messageContent}>
              <div className={styles.typingIndicator}>
                <span className={styles.typingLabel}>Nick is typing…</span>
                <div className={styles.typingDots}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputContainer}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={isLoading}
          className={styles.input}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className={styles.sendButton}
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
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  );
}
