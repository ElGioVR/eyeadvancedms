'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Download, X, Share, Plus } from 'lucide-react';

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export default function OfflineAndInstall() {
  const [isOffline, setIsOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    setIsOffline(!navigator.onLine);

    const dismissed = localStorage.getItem('ea-install-dismissed');
    if (dismissed) return;

    if (isIOS()) {
      const iosDismissed = localStorage.getItem('ea-install-ios-dismissed');
      if (!iosDismissed) {
        setTimeout(() => setShowIOSGuide(true), 3000);
      }
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
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

  function dismissAndroid() {
    setShowInstall(false);
    setInstallPrompt(null);
    localStorage.setItem('ea-install-dismissed', '1');
  }

  function dismissIOS() {
    setShowIOSGuide(false);
    localStorage.setItem('ea-install-ios-dismissed', '1');
  }

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Sin conexión — datos pueden estar desactualizados</span>
        </div>
      )}

      {/* Android / Chrome install popup */}
      {showInstall && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 animate-slideUp">
          <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 shadow-2xl shadow-black/20">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10">
                <Download className="h-5 w-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Instalar EyeAdvanced</p>
                <p className="text-xs text-gray-500 dark:text-[#71767B] mt-0.5">Acceso rápido desde tu pantalla de inicio, sin navegador</p>
              </div>
              <button onClick={dismissAndroid} className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={dismissAndroid} className="flex-1 rounded-xl border border-gray-200 dark:border-[#2F3336] px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                Ahora no
              </button>
              <button onClick={handleInstall} className="flex-1 rounded-xl bg-primary-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-primary-700 transition-colors shadow-sm">
                Instalar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari guide */}
      {showIOSGuide && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 animate-slideUp">
          <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4 shadow-2xl shadow-black/20">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10">
                <Plus className="h-5 w-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Agregar a inicio</p>
                <p className="text-xs text-gray-500 dark:text-[#71767B] mt-0.5">Abre EyeAdvanced como app desde tu pantalla de inicio</p>
              </div>
              <button onClick={dismissIOS} className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-[#202327] p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-xs font-bold text-primary-700 dark:text-primary-400">1</span>
                <p className="text-xs text-gray-600 dark:text-[#71767B]">Toca el botón <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">Compartir</span> <Share className="inline h-3 w-3" /> abajo</p>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-[#202327] p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-xs font-bold text-primary-700 dark:text-primary-400">2</span>
                <p className="text-xs text-gray-600 dark:text-[#71767B]">Selecciona <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">Agregar a pantalla de inicio</span></p>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-[#202327] p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-xs font-bold text-primary-700 dark:text-primary-400">3</span>
                <p className="text-xs text-gray-600 dark:text-[#71767B]">Toca <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">Agregar</span> y listo</p>
              </div>
            </div>
            <button onClick={dismissIOS} className="w-full mt-3 rounded-xl bg-primary-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-primary-700 transition-colors">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
