import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import styles from '../styles/Navbar.module.css';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    document.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('scroll', handleScroll);
    };
  }, [scrolled]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.navbarContainer}>
        <div className={styles.navbarBrand}>
          <Link href="/" className={styles.logo}>
            Truecast
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className={styles.navLinks}>
          <Link href="/" className={styles.navLink}>
            Markets
          </Link>
          <Link href="/create" className={styles.navLink}>
            Create Market
          </Link>
          <Link href="/resolve" className={styles.navLink}>
            Resolve Market
          </Link>
          <Link href="/stats" className={styles.navLink}>
            Stats
          </Link>
          <div className={styles.connectButton}>
            <ConnectButton />
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className={`${styles.hamburger} ${isOpen ? styles.open : ''}`} 
          onClick={toggleMenu}
          aria-label="Menu"
        >
          <span className={styles.hamburgerBox}>
            <span className={styles.hamburgerInner}></span>
          </span>
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={`${styles.mobileMenu} ${isOpen ? styles.open : ''}`}>
        <div className={styles.mobileMenuContent}>
          <Link href="/" className={styles.mobileNavLink} onClick={toggleMenu}>
            Markets
          </Link>
          <Link href="/create" className={styles.mobileNavLink} onClick={toggleMenu}>
            Create Market
          </Link>
          <Link href="/resolve" className={styles.mobileNavLink} onClick={toggleMenu}>
            Resolve Market
          </Link>
          <Link href="/stats" className={styles.mobileNavLink} onClick={toggleMenu}>
            Stats
          </Link>
          <div className={styles.mobileConnectButton}>
            <ConnectButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
