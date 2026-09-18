'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Download, X } from 'lucide-react';

export default function OfflineAndInstall() {
  const [isOffline, setIsOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    setIsOffline(!navigator.onLine);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      const dismissed = localStorage.getItem('ea-install-dismissed');
      if (!dismissed) setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstall(false);
      setInstallPrompt(null);
    }
  }

  function dismissInstall() {
    setShowInstall(false);
    setInstallPrompt(null);
    localStorage.setItem('ea-install-dismissed', '1');
  }

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Sin conexión — datos pueden estar desactualizados</span>
        </div>
      )}

      {showInstall && !isOffline && (
        <div className="fixed bottom-24 lg:bottom-6 right-4 left-4 sm:left-auto sm:w-80 z-50 rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10">
              <Download className="h-5 w-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Instalar EyeAdvanced</p>
              <p className="text-xs text-gray-500 dark:text-[#71767B] mt-0.5">Acceso rápido desde tu pantalla de inicio</p>
            </div>
            <button onClick={dismissInstall} className="shrink-0 p-1 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={dismissInstall} className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-3 py-2 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
              Ahora no
            </button>
            <button onClick={handleInstall} className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700">
              Instalar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
