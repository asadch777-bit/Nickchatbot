'use client';

import { useState } from 'react';
import Chatbot from './Chatbot';
import styles from './ChatPopup.module.css';

export default function ChatPopup() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button onClick={() => setOpen(true)} className={styles.popupButton}>
          {/* Green circle with icon */}
          <div className={styles.iconCircle}>
            💬
          </div>
          {/* Label under the circle */}
          <span className={styles.chatLabel}>Chat with us</span>
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div className={styles.popupWindow}>
          <div className={styles.chatContent}>
            <Chatbot onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
