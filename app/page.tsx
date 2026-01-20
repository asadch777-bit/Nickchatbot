import ChatPopup from '@/components/ChatPopup';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <ChatPopup />
      </div>
    </main>
  );
}

