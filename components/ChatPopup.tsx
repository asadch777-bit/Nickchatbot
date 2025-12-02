'use client';

import { useState } from 'react';
import Chatbot from './Chatbot';

export default function ChatPopup() {
  const [open, setOpen] = useState(false);

  return (
    <>
      
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#00A859', // Gtech green
            color: 'white',
            fontSize: '28px',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            zIndex: 9999,
          }}
        >
          💬
        </button>
      )}

      
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '380px',
            height: '520px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10000,
          }}
        >

          <div
            style={{
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #ddd',
              backgroundColor: '#f6f6f6',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Gtech Digital Assistant
            <button
              onClick={() => setOpen(false)}
              style={{
                border: 'none',
                background: 'none',
                fontSize: '20px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>


          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Chatbot />
          </div>
        </div>
      )}
    </>
  );
}
