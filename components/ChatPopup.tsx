'use client';

import { useState } from 'react';
import Chatbot from './Chatbot';
import styles from './ChatPopup.module.css';

export default function ChatPopup() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FLOATING BUTTON (when closed) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={styles.popupButton}
        >
          {/* Nick Image */}
          <div className={styles.avatarContainer}>
            <img
              src="/Nickp.png"
              alt="Nick Avatar"
              className={styles.avatarImage}
            />
          </div>

          {/* Text under image */}
          <span className={styles.buttonText}>
            Click here for Product Assitance 
          </span>
        </button>
      )}

      {/* CHAT WINDOW (when open) */}
      {open && (
        <div className={styles.popupWindow}>
          {/* HEADER */}
          <div className={styles.popupHeader}>
            Gtech Digital Assistant

            <button
              onClick={() => setOpen(false)}
              className={styles.closeButton}
            >
              ✕
            </button>
          </div>

          {/* CHATBOT CONTENT */}
          <div className={styles.chatContent}>
            <Chatbot />
          </div>
        </div>
      )}
    </>
  );
}
