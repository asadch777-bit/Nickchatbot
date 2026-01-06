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
      content: "Hi! I'm NICK, your intelligent\nGtech product assistant. I can help\nyou with product information,\npricing, sales, ordering, and more.\nAll information is fetched live from\nour website. What would you like\nto know?",
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
    
    // Preserve <a> tags - use a robust pattern to capture complete links including full URLs
    // CRITICAL: This must capture the ENTIRE link including long URLs like /products/power-tools
    // The issue is that non-greedy matching might stop early, so we need a more robust approach
    let processedText = text;
    
    // Use a more robust method: find all <a tags and match them with their closing </a>
    // This ensures we capture the complete link even with long URLs in the link text
    const anchorMatches: Array<{ fullMatch: string; startIndex: number; endIndex: number }> = [];
    let searchIndex = 0;
    
    while (searchIndex < text.length) {
      const openTagIndex = text.indexOf('<a', searchIndex);
      if (openTagIndex === -1) break;
      
      // Find the end of the opening tag
      const tagEndIndex = text.indexOf('>', openTagIndex);
      if (tagEndIndex === -1) break;
      
      // Find the matching closing tag - look for </a> after the opening tag
      // We need to find the REAL closing tag, not just any </a>
      let closeTagIndex = text.indexOf('</a>', tagEndIndex);
      if (closeTagIndex === -1) break;
      
      // Extract the full anchor tag
      const fullMatch = text.substring(openTagIndex, closeTagIndex + 4); // +4 for '</a>'
      
      // Only process if it looks like a valid anchor tag with href
      if (fullMatch.includes('href')) {
        anchorMatches.push({
          fullMatch: fullMatch,
          startIndex: openTagIndex,
          endIndex: closeTagIndex + 4
        });
        searchIndex = closeTagIndex + 4;
      } else {
        searchIndex = tagEndIndex + 1;
      }
    }
    
    // Replace anchor tags from end to start to preserve indices
    for (let i = anchorMatches.length - 1; i >= 0; i--) {
      const { fullMatch, startIndex, endIndex } = anchorMatches[i];
      const placeholder = `__EXISTING_LINK_${existingLinkIndex++}__`;
      existingLinks.push({
        placeholder,
        html: fullMatch, // Preserve the original HTML exactly
      });
      processedText = processedText.substring(0, startIndex) + placeholder + processedText.substring(endIndex);
    }

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
    // CRITICAL: Convert markdown links to plain clickable URLs (remove brackets, show only URL)
    const markdownLinkPlaceholders: Array<{ placeholder: string; html: string }> = [];
    let markdownIndex = 0;
    
    // Process markdown links manually to handle parentheses in link text correctly
    // Find all [text](url) patterns, including those with parentheses in the text
    let markdownSearchIndex = 0;
    const markdownMatches: Array<{ fullMatch: string; url: string; startIndex: number; endIndex: number }> = [];
    
    while (markdownSearchIndex < processedText.length) {
      const openBracket = processedText.indexOf('[', markdownSearchIndex);
      if (openBracket === -1) break;
      
      const closeBracket = processedText.indexOf(']', openBracket + 1);
      if (closeBracket === -1) break;
      
      const openParen = processedText.indexOf('(', closeBracket + 1);
      if (openParen === -1 || openParen !== closeBracket + 1) {
        markdownSearchIndex = openBracket + 1;
        continue;
      }
      
      const closeParen = processedText.indexOf(')', openParen + 1);
      if (closeParen === -1) break;
      
      // Extract URL (between parentheses)
      let url = processedText.substring(openParen + 1, closeParen).trim();
      
      // CRITICAL: Remove any trailing punctuation from the URL (like closing parentheses)
      // This prevents 404 errors when URLs have trailing brackets
      url = url.replace(/[)\].,!?;:]+$/, '');
      
      // Only process if it looks like a URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const fullMatch = processedText.substring(openBracket, closeParen + 1);
        markdownMatches.push({
          fullMatch,
          url,
          startIndex: openBracket,
          endIndex: closeParen + 1
        });
        markdownSearchIndex = closeParen + 1;
      } else {
        markdownSearchIndex = openBracket + 1;
      }
    }
    
    // Replace markdown links from end to start to preserve indices
    for (let i = markdownMatches.length - 1; i >= 0; i--) {
      const { fullMatch, url, startIndex, endIndex } = markdownMatches[i];
      const placeholder = `__MARKDOWN_LINK_${markdownIndex++}__`;
      // Use the URL as the link text instead of the markdown text to avoid showing brackets
      // This ensures clean display: just the clickable URL without brackets
      const cleanUrl = url.trim();
      markdownLinkPlaceholders.push({
        placeholder,
        html: `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${escapeHtml(cleanUrl)}</a>`,
      });
      processedText = processedText.substring(0, startIndex) + placeholder + processedText.substring(endIndex);
    }
    
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
    // Match complete URLs including full paths - CRITICAL: must capture entire URL including all path segments
    // Pattern: http:// or https:// followed by domain and complete path (allows hyphens, slashes, dots, etc.)
    // IMPORTANT: This pattern must match the FULL URL like https://www.gtech.co.uk/products/power-tools
    // The pattern stops ONLY at whitespace, <, >, quotes - NOT at slashes or hyphens
    const urlPattern = /https?:\/\/[^\s<>"']+/g;
    const urlMatches: Array<{ url: string; index: number; replacement: string }> = [];
    // Reuse match variable from above (reset it)
    match = null;
    
    // First pass: collect all URL matches with their positions
    while ((match = urlPattern.exec(html)) !== null) {
      const matched = match[0];
      const matchIndex = match.index;
      
      // Skip if this looks like part of a placeholder
      if (matched.includes('__LINK_') || matched.includes('__MARKDOWN_') || matched.includes('__EXISTING_') || matched.includes('__VALID_TAG_')) {
        continue;
      }
      
      // CRITICAL: Check if this URL is already inside an anchor tag
      // We need to check if there's an unclosed <a tag before this URL
      const textBeforeMatch = html.substring(0, matchIndex);
      
      // Find the last <a tag (both escaped and unescaped)
      const lastOpenTag = Math.max(
        textBeforeMatch.lastIndexOf('<a'),
        textBeforeMatch.lastIndexOf('&lt;a')
      );
      const lastCloseTag = Math.max(
        textBeforeMatch.lastIndexOf('</a>'),
        textBeforeMatch.lastIndexOf('&lt;/a&gt;')
      );
      
      // If we're inside a link (lastOpenTag > lastCloseTag), skip this URL
      // This prevents converting URLs that are already part of link text
      if (lastOpenTag > lastCloseTag) {
        continue; // Skip - URL is already inside a link
      }
      
      // Also check if this URL is part of a placeholder (already processed)
      if (textBeforeMatch.includes('__EXISTING_LINK_') || textBeforeMatch.includes('__VALID_TAG_')) {
        // Check if we're inside a placeholder by looking backwards
        const lastPlaceholder = Math.max(
          textBeforeMatch.lastIndexOf('__EXISTING_LINK_'),
          textBeforeMatch.lastIndexOf('__VALID_TAG_')
        );
        if (lastPlaceholder > lastCloseTag) {
          continue; // Skip - URL is inside a placeholder
        }
      }
      
      // URL is not inside a link, so convert it
      // Remove trailing punctuation that shouldn't be part of the URL
      // CRITICAL: Remove closing parentheses ) that are not part of the URL (causes 404 errors)
      let cleanUrl = matched;
      let trailing = '';
      // Remove trailing punctuation including parentheses, periods, commas, etc.
      // Only remove if URL doesn't end with / (which is valid)
      if (!cleanUrl.endsWith('/')) {
        // Check for trailing punctuation: ), ], ., ,, !, ?, ;, :
        const trailingPunctMatch = cleanUrl.match(/^(.+?)([)\].,!?;:]+)$/);
        if (trailingPunctMatch) {
          cleanUrl = trailingPunctMatch[1];
          trailing = trailingPunctMatch[2];
        }
      }
      
      // Unescape the URL for the href attribute
      const unescapedUrl = cleanUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
      // Escape for HTML attributes
      const escapedHref = unescapedUrl.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // CRITICAL: Use the full cleanUrl for both href and link text to ensure the entire URL is clickable
      const replacement = `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${cleanUrl}</a>${trailing}`;
      
      urlMatches.push({ url: matched, index: matchIndex, replacement });
    }
    
    // Second pass: replace URLs from end to start to preserve indices
    for (let i = urlMatches.length - 1; i >= 0; i--) {
      const { url, index, replacement } = urlMatches[i];
      html = html.substring(0, index) + replacement + html.substring(index + url.length);
    }
    
    // Step 5: Replace markdown link placeholders with actual HTML links
    markdownLinkPlaceholders.forEach(({ placeholder, html: linkHtml }) => {
      html = html.replace(placeholder, linkHtml);
    });
    
    // Step 6: Replace existing link placeholders back to original HTML
    existingLinks.forEach(({ placeholder, html: linkHtml }) => {
      html = html.replace(placeholder, linkHtml);
    });

    // Step 6.5: Remove any remaining EXISTING_LINK placeholders that weren't in the array
    // This handles cases where the API returns these placeholders as plain text
    html = html.replace(/__EXISTING_LINK_\d+__/g, '');
    
    // Step 6.6: Clean up any leftover markdown link syntax that wasn't converted
    // Remove patterns like "(Teal)](url)" or "](url)" that might be left over from incomplete markdown links
    // Only remove if it's not already part of a valid HTML link
    html = html.replace(/([^<])\](\(https?:\/\/[^\s<>"']+\))/g, '$1'); // Remove ](url) patterns that aren't in links
    html = html.replace(/([^<])\[([^\]]*)\]\(/g, '$1'); // Remove [text]( patterns that weren't matched (but keep text before)

    // Step 7: Replace break placeholders back to <br> tags
    existingBreaks.forEach(({ placeholder, html: breakHtml }) => {
      html = html.replace(placeholder, breakHtml);
    });

    // Step 7.5: Remove any remaining BR_TAG placeholders that weren't in the array
    html = html.replace(/__BR_TAG_\d+__/g, '');

    // Step 8: Replace bold placeholders back to <strong> tags
    existingBold.forEach(({ placeholder, html: boldHtml }) => {
      html = html.replace(placeholder, boldHtml);
    });

    // Step 8.5: Remove any remaining BOLD_TAG placeholders that weren't in the array
    html = html.replace(/__BOLD_TAG_\d+__/g, '');

    // Step 8.6: Clean up any trailing dashes or extra whitespace left after removing placeholders
    // Remove standalone dashes with whitespace (e.g., " - " or " -<br>" or "<br> - ")
    html = html.replace(/\s*-\s*(<br>|$)/g, '$1');
    html = html.replace(/(<br>|^)\s*-\s*/g, '$1');
    // Remove multiple consecutive line breaks
    html = html.replace(/(<br>\s*){3,}/g, '<br><br>');
    // Clean up any remaining placeholder-like patterns that might have been missed
    html = html.replace(/__[A-Z_]+_\d+__/g, '');

    // Step 8.7: Clean up broken HTML fragments (exposed HTML attributes)
    // Remove any exposed HTML attributes that appear as plain text
    // This handles cases where HTML attributes leak into the visible text
    
    // First, protect ALL valid HTML anchor tags by temporarily replacing them
    // This MUST happen before any cleanup to prevent breaking valid links
    // CRITICAL: Use the same robust method as Step 1 to ensure we capture complete links
    const validTags: Array<{ placeholder: string; html: string }> = [];
    let tagIndex = 0;
    
    // Use manual matching to find complete anchor tags (same approach as Step 1)
    const validTagMatches: Array<{ fullMatch: string; startIndex: number; endIndex: number }> = [];
    let validSearchIndex = 0;
    
    while (validSearchIndex < html.length) {
      const openTagIndex = html.indexOf('<a', validSearchIndex);
      if (openTagIndex === -1) break;
      
      const tagEndIndex = html.indexOf('>', openTagIndex);
      if (tagEndIndex === -1) break;
      
      let closeTagIndex = html.indexOf('</a>', tagEndIndex);
      if (closeTagIndex === -1) break;
      
      const fullMatch = html.substring(openTagIndex, closeTagIndex + 4);
      
      if (fullMatch.includes('href')) {
        validTagMatches.push({
          fullMatch: fullMatch,
          startIndex: openTagIndex,
          endIndex: closeTagIndex + 4
        });
        validSearchIndex = closeTagIndex + 4;
      } else {
        validSearchIndex = tagEndIndex + 1;
      }
    }
    
    // Replace valid tags from end to start
    for (let i = validTagMatches.length - 1; i >= 0; i--) {
      const { fullMatch, startIndex, endIndex } = validTagMatches[i];
      const placeholder = `__VALID_TAG_${tagIndex++}__`;
      validTags.push({ placeholder, html: fullMatch });
      html = html.substring(0, startIndex) + placeholder + html.substring(endIndex);
    }
    
    // Now remove broken HTML fragments from the unprotected text only
    // These should NOT match the protected placeholders
    html = html.replace(/\s*target="_blank"\s*/gi, '');
    html = html.replace(/\s*rel="noopener noreferrer"\s*/gi, '');
    html = html.replace(/\s*style="[^"]*"\s*/gi, '');
    html = html.replace(/\s*">\s*View Product/gi, '');
    html = html.replace(/\s*">\s*View\s*/gi, '');
    // Only replace "> " if it's not immediately after a protected tag placeholder
    html = html.replace(/(?<!__VALID_TAG_\d+__)\s*">\s*(?!__VALID_TAG_)/g, ' ');
    html = html.replace(/<a\s*>/gi, '');
    html = html.replace(/<\/a>\s*\(/g, ' (');
    html = html.replace(/\)\s*<\/a>/g, ')');
    
    // Restore valid HTML tags - this MUST happen last
    validTags.forEach(({ placeholder, html: tagHtml }) => {
      html = html.replace(placeholder, tagHtml);
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
              src="/Nick.png" 
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
