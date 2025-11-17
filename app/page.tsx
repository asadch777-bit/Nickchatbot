import Chatbot from '@/components/Chatbot';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Welcome to Gtech</h1>
          <p className={styles.subtitle}>
            Chat with NICK, your intelligent product assistant
          </p>
        </div>
        <Chatbot />
        <div className={styles.footer}>
          <p>
            Powered by Gtech |{' '}
            <a href="https://www.gtech.co.uk/" target="_blank" rel="noopener noreferrer">
              Visit Gtech Website
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

