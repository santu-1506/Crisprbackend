import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X, Home, FlaskConical, FileBarChart, Settings as SettingsIcon, User, LogOut, Dna } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { jwtDecode } from 'jwt-decode';

const Navbar = () => {
  const [isOpen, setIsOpen]                   = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail]             = useState('');
  const [userFullName, setUserFullName]       = useState('');
  const [scrolled, setScrolled]               = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navigation = [
    { name: 'Home',     href: '/',         icon: Home },
    { name: 'Predict',  href: '/predict',  icon: FlaskConical },
    { name: 'Results',  href: '/results',  icon: FileBarChart },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  const isActive = (p) => location.pathname === p;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const check = () => {
      try {
        const token    = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');
        if (!token || !userData) {
          setIsAuthenticated(false); setUserEmail(''); setUserFullName(''); return;
        }
        const decoded = jwtDecode(token);
        if (decoded.exp < Date.now() / 1000) {
          ['authToken', 'userData', 'isAuthenticated', 'refreshToken'].forEach((k) => localStorage.removeItem(k));
          setIsAuthenticated(false); setUserEmail(''); setUserFullName(''); return;
        }
        const u = JSON.parse(userData);
        setIsAuthenticated(true); setUserEmail(u.email); setUserFullName(u.fullName);
      } catch {
        ['authToken', 'userData', 'isAuthenticated', 'refreshToken'].forEach((k) => localStorage.removeItem(k));
        setIsAuthenticated(false);
      }
    };
    check();
  }, [location]);

  const handleLogout = () => {
    ['authToken', 'userData', 'refreshToken', 'isAuthenticated',
     'userEmail', 'userName', 'savedEmail', 'savedPassword',
     'rememberMe', 'googleAuth'].forEach((k) => localStorage.removeItem(k));
    setIsAuthenticated(false); setUserEmail(''); setUserFullName('');
    toast.success('Logged out');
    navigate('/auth');
  };

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${
      scrolled ? 'glass-strong shadow-lg shadow-black/40' : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* LOGO */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <motion.div
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30"
            >
              <Dna className="w-5 h-5 text-white" />
            </motion.div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-base leading-none">
                CRISPR <span className="text-gradient">BERT</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 leading-none mt-1">
                v2 · F1=0.924
              </span>
            </div>
          </Link>

          {/* DESKTOP NAV */}
          <div className="hidden md:flex items-center gap-1">
            {isAuthenticated && navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`relative px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                    active ? 'text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                  {active && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/15 to-purple-500/15 border border-cyan-500/20 -z-10"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}

            <div className={`flex items-center gap-3 ${isAuthenticated ? 'ml-4 pl-4 border-l border-white/10' : ''}`}>
              {isAuthenticated ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-[10px] font-bold">
                      {(userFullName || userEmail).charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden lg:inline">{userFullName || userEmail.split('@')[0]}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2"
                >
                  <User className="w-4 h-4" />
                  Login
                </Link>
              )}
            </div>
          </div>

          {/* MOBILE BUTTON */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* MOBILE NAV */}
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="md:hidden overflow-hidden glass border-t border-white/5"
      >
        <div className="px-3 py-3 space-y-1">
          {isAuthenticated && navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
          {isAuthenticated ? (
            <button
              onClick={() => { handleLogout(); setIsOpen(false); }}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          ) : (
            <Link
              to="/auth"
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-center font-medium"
            >
              Login
            </Link>
          )}
        </div>
      </motion.div>
    </nav>
  );
};

export default Navbar;
