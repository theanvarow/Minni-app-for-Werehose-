"use client";
import { useState, useEffect, useRef } from "react";

const playSound = (type) => {
  if (typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playBeep = (freq, delay, duration, volume, waveType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = waveType;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    };

    if (type === "success") {
      // Louder, brighter double bell chime (ding-ding scanner ringtone)
      playBeep(1046.50, 0, 0.35, 0.35, "sine");      // C6 note
      playBeep(1318.51, 0.07, 0.45, 0.3, "sine");   // E6 note
    } else if (type === "warning") {
      // Loud prominent warning double-beep (beep-beep!)
      playBeep(220, 0, 0.25, 0.4, "triangle");      // A3 note
      playBeep(220, 0.12, 0.25, 0.4, "triangle");   // A3 note
    } else if (type === "click") {
      // Crisp click
      playBeep(1200, 0, 0.06, 0.06, "sine");
    }
  } catch (e) {
    console.error("Audio play failed:", e);
  }
};

export default function Home() {
  const [itemQueue, setItemQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Background fetching state so we don't show spinners
  const [isFetchingBackground, setIsFetchingBackground] = useState(false);
  
  const [userName, setUserName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [shift, setShift] = useState("");
  const [shiftInput, setShiftInput] = useState("");
  const [showPlacementConfirm, setShowPlacementConfirm] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState("");
  const [totalQueueCount, setTotalQueueCount] = useState(0);
  
  // Statistics states
  const [showStats, setShowStats] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [selectedDateStr, setSelectedDateStr] = useState("");

  // 'готова' Statistics states
  const [showGotovaStats, setShowGotovaStats] = useState(false);
  const [gotovaStatsData, setGotovaStatsData] = useState(null);
  const [loadingGotovaStats, setLoadingGotovaStats] = useState(false);
  const [gotovaStatsError, setGotovaStatsError] = useState("");
  const [selectedGotovaMonth, setSelectedGotovaMonth] = useState("");

  // 'излишка' Statistics states
  const [showIzlishkaStats, setShowIzlishkaStats] = useState(false);
  const [selectedIzlishkaDateStr, setSelectedIzlishkaDateStr] = useState("");



  const [activeMode, setActiveMode] = useState(""); // "proverka" | "izlishka"
  const [izlishkaCount, setIzlishkaCount] = useState(0);

  const [actionToast, setActionToast] = useState(null);

  useEffect(() => {
    if (!actionToast) return;
    const timer = setTimeout(() => {
      setActionToast(null);
    }, 1400);
    return () => clearTimeout(timer);
  }, [actionToast]);

  const [isScanned, setIsScanned] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [overrideQuota, setOverrideQuota] = useState(false);
  const DAILY_QUOTA = 93;
  const showCelebration = completedCount >= DAILY_QUOTA && !overrideQuota;

  // PWA states
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  const currentItem = itemQueue.length > 0 ? itemQueue[0] : null;

  const getProductId = (item) => {
    if (!item) return "";
    let rawId = "";
    if (item.productId) {
      rawId = String(item.productId).trim();
    } else {
      const cleanBarcode = item.barcode ? String(item.barcode).trim() : "";
      if (cleanBarcode.startsWith("1000") && cleanBarcode.length === 13) {
        rawId = cleanBarcode.substring(4, 11);
      }
    }
    
    // Sanitize: strip floating point decimals (e.g. 2801757.0 -> 2801757)
    if (rawId.includes(".")) {
      rawId = rawId.split(".")[0];
    }
    return rawId.replace(/\D/g, ""); // Keep only digits
  };

  const currentProductId = getProductId(currentItem);

  // Scanner barcode input buffer
  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  useEffect(() => {
    setIsScanned(false);
    setShowPlacementConfirm(false);
  }, [currentItem]);



  useEffect(() => {
    if (!currentItem || !isLoggedIn) return;

    const handleKeyDown = (e) => {
      // Ignore key events if user is typing in form inputs (like Login screen or manual input modal)
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        return;
      }

      const currentTime = Date.now();
      
      // If time since last key is more than 100ms, reset buffer (new scan started)
      if (currentTime - lastKeyTime.current > 100) {
        barcodeBuffer.current = "";
      }
      
      lastKeyTime.current = currentTime;

      if (e.key === "Enter") {
        const scanned = barcodeBuffer.current.trim();
        if (scanned) {
          processScannedBarcode(scanned);
        }
        barcodeBuffer.current = "";
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentItem, isLoggedIn]);

  const processScannedBarcode = (scanned) => {
    if (!currentItem) return;
    
    // Clean barcodes to ignore leading zeros or spaces for robust comparison
    const cleanScanned = scanned.replace(/\D/g, "");
    const cleanCurrent = currentItem.barcode.replace(/\D/g, "");

    if (cleanScanned === cleanCurrent) {
      setIsScanned(true);
      if (activeMode === "proverka") {
        playSound("success");
        setShowPlacementConfirm(true); // Automatically show dimension confirmation in Proverka mode
      } else if (activeMode === "izlishka") {
        // Automatically submit and move to next item in Izlishka mode without pressing button
        handleUpdate("Собрано");
      }
    } else {
      playSound("warning");
      alert(`Неверный штрихкод! Сканирован: ${scanned}, Требуется: ${currentItem.barcode}`);
    }
  };


  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("SW registered"))
        .catch((err) => console.log("SW registration error", err));
    }

    // Detect standalone mode
    const isStandaloneMode = 
      window.matchMedia("(display-mode: standalone)").matches || 
      (typeof window !== "undefined" && window.navigator && window.navigator.standalone === true);
    setIsStandalone(!!isStandaloneMode);

    // Attempt to lock screen orientation to landscape
    const lockOrientation = async () => {
      try {
        if (typeof screen !== "undefined" && screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape");
        }
      } catch (e) {
        console.warn("Orientation lock not supported:", e);
      }
    };
    lockOrientation();

    // Detect if inside in-app browser (Telegram, Instagram, etc)
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent || window.navigator.vendor || window.opera || "";
      const inApp = (ua.indexOf("FBAN") > -1) || 
                    (ua.indexOf("FBAV") > -1) || 
                    (ua.indexOf("Instagram") > -1) || 
                    (ua.indexOf("Telegram") > -1) || 
                    (ua.indexOf("Messenger") > -1);
      setIsInAppBrowser(inApp);
    }

    // Check if user is logged in
    const storedName = localStorage.getItem("userName");
    const storedShift = localStorage.getItem("shift");
    const storedFloor = localStorage.getItem("selectedFloor");
    const storedMode = localStorage.getItem("activeMode");
    if (storedName) {
      setUserName(storedName);
      setShift(storedShift || "");
      setIsLoggedIn(true);
      
      const todayStr = new Date().toISOString().split('T')[0];
      const storedCount = localStorage.getItem(`audit_count_${storedName}_${todayStr}`);
      setCompletedCount(storedCount ? parseInt(storedCount, 10) : 0);

      const storedIzlishka = localStorage.getItem(`izlishka_count_${storedName}_${todayStr}`);
      setIzlishkaCount(storedIzlishka ? parseInt(storedIzlishka, 10) : 0);

      if (storedMode) {
        setActiveMode(storedMode);
        if (storedFloor) {
          setSelectedFloor(storedFloor);
          fetchItems(false, storedFloor, storedShift || "", storedMode);
        } else {
          setLoading(false); // Show floor selection screen
        }
      } else {
        setLoading(false); // Show mode selection screen
      }
    } else {
      setLoading(false); // Stop loading to show login screen
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!shiftInput) {
      alert("Пожалуйста, выберите вашу смену!");
      return;
    }
    const trimmedName = nameInput.trim();
    if (trimmedName.length > 2) {
      localStorage.setItem("userName", trimmedName);
      localStorage.setItem("shift", shiftInput);
      setUserName(trimmedName);
      setShift(shiftInput);
      setIsLoggedIn(true);
      
      const todayStr = new Date().toISOString().split('T')[0];
      const storedCount = localStorage.getItem(`audit_count_${trimmedName}_${todayStr}`);
      setCompletedCount(storedCount ? parseInt(storedCount, 10) : 0);
      
      const storedIzlishka = localStorage.getItem(`izlishka_count_${trimmedName}_${todayStr}`);
      setIzlishkaCount(storedIzlishka ? parseInt(storedIzlishka, 10) : 0);
      setOverrideQuota(false);

      // Clear mode & floor to force mode & floor selection after login
      localStorage.removeItem("activeMode");
      localStorage.removeItem("selectedFloor");
      setActiveMode("");
      setSelectedFloor("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userName");
    localStorage.removeItem("shift");
    localStorage.removeItem("selectedFloor");
    localStorage.removeItem("activeMode");
    setIsLoggedIn(false);
    setUserName("");
    setShift("");
    setActiveMode("");
    setSelectedFloor("");
    setItemQueue([]);
    setShowPlacementConfirm(false);
    setCompletedCount(0);
    setIzlishkaCount(0);
    setOverrideQuota(false);
  };

  const handleModeChange = (newMode) => {
    localStorage.setItem("activeMode", newMode);
    setActiveMode(newMode);
    localStorage.removeItem("selectedFloor");
    setSelectedFloor("");
    setTotalQueueCount(0);
    setItemQueue([]);
    verifiedRowsRef.current = new Set();
  };

  const handleFloorChange = (newFloor) => {
    localStorage.setItem("selectedFloor", newFloor);
    setSelectedFloor(newFloor);
    setTotalQueueCount(0);
    setItemQueue([]);
    verifiedRowsRef.current = new Set();
    if (newFloor) {
      fetchItems(false, newFloor, shift, activeMode);
    }
  };

  const verifiedRowsRef = useRef(new Set());

  const fetchItems = async (isBackground = false, targetFloor = selectedFloor, targetShift = shift, targetMode = activeMode) => {
    if (isFetchingBackground) return;
    
    try {
      if (!isBackground) {
        setLoading(true);
      } else {
        setIsFetchingBackground(true);
      }
      setError("");
      
      const activeUserName = userName || (typeof window !== "undefined" ? localStorage.getItem("userName") : "") || "";
      const currentMode = targetMode || activeMode || "proverka";
      const res = await fetch(`/api/inventory?floor=${targetFloor}&shift=${encodeURIComponent(targetShift + " смена")}&mode=${currentMode}&userName=${encodeURIComponent(activeUserName)}&t=${Date.now()}`);
      const data = await res.json();

      if (data.success) {
        if (data.totalCount !== undefined) {
          setTotalQueueCount(data.totalCount);
        }
        let newItems = [];
        if (data.items && data.items.length > 0) {
          newItems = data.items;
        } else if (data.item) {
          newItems = [data.item]; // Fallback if GAS is running the old script
        }

        if (newItems.length > 0) {
          const existingRowIndexes = new Set(itemQueue.map(i => i.rowIndex));
          const filteredNew = newItems.filter(i => !existingRowIndexes.has(i.rowIndex) && !verifiedRowsRef.current.has(i.rowIndex));
          
          if (filteredNew.length > 0) {
            setItemQueue(prev => [...prev, ...filteredNew]);
          } else {
            // We received items, but they were ALL already verified (backend is slow).
            // We should poll again in 1.5 seconds if we are in background mode.
            if (isBackground) {
              setTimeout(() => {
                fetchItems(true, targetFloor, targetShift, currentMode);
              }, 1500);
              // Do not set isFetchingBackground to false yet, let the spinner keep spinning
              return;
            }
          }
        }
      } else {
        if (!isBackground) setError(data.error || "Ошибка при загрузке данных");
      }
    } catch (err) {
      if (!isBackground) setError("Нет связи с сервером или интернетом");
    } finally {
      setLoading(false);
      setIsFetchingBackground(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchStats();
      fetchGotovaStats();
    }
  }, [isLoggedIn]);

  const fetchStats = async (force = false) => {
    if (!statsData || force) {
      setLoadingStats(true);
    }
    setStatsError("");
    try {
      const forceParam = force ? "&force=true" : "";
      const res = await fetch(`/api/inventory?action=stats${forceParam}&t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        if (data.stats) {
          setStatsData(data.stats);
        } else {
          setStatsError("Пожалуйста, обновите Google Apps Script до последней версии.");
        }
      } else {
        setStatsError(data.error || "Не удалось загрузить статистику");
      }
    } catch (err) {
      setStatsError("Ошибка подключения к серверу");
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchGotovaStats = async (force = false) => {
    if (!gotovaStatsData || force) {
      setLoadingGotovaStats(true);
    }
    setGotovaStatsError("");
    try {
      const forceParam = force ? "&force=true" : "";
      const res = await fetch(`/api/inventory?action=gotova_stats${forceParam}&t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setGotovaStatsData(data);
        if (data.monthly && Object.keys(data.monthly).length > 0) {
          const sortedMonths = Object.keys(data.monthly).sort((a, b) => b.localeCompare(a));
          setSelectedGotovaMonth(sortedMonths[0]);
        }
      } else {
        setGotovaStatsError(data.error || "Не удалось загрузить аналитику");
      }
    } catch (err) {
      setGotovaStatsError("Ошибка подключения к серверу");
    } finally {
      setLoadingGotovaStats(false);
    }
  };

  const handleUpdate = async (status, placementCorrect = "") => {
    if (itemQueue.length === 0) return;

    if (status === "Подтвержден" || status === "Собрано") {
      playSound("success");
      const msg = activeMode === "izlishka" 
        ? "✅ Излишек собран! Переход к следующему..." 
        : "✅ Подтверждено! Переход к следующему...";
      setActionToast({ text: msg, type: "success", id: Date.now() });
    } else if (status === "Отсутствует") {
      playSound("warning");
      setActionToast({ text: "❌ Отмечено как отсутствующий. Переход к следующему...", type: "missing", id: Date.now() });
    }

    // Mark as verified so we don't fetch it again while backend is syncing
    verifiedRowsRef.current.add(currentItem.rowIndex);

    // OPTIMISTIC UI: Immediately remove the item from the queue to show the next one
    setItemQueue(prevQueue => prevQueue.filter(item => item.rowIndex !== currentItem.rowIndex));
    setTotalQueueCount(prev => Math.max(0, prev - 1));
    setShowPlacementConfirm(false);

    const todayStr = new Date().toISOString().split('T')[0];

    // Increment and save today's count based on active mode
    if (activeMode === "izlishka") {
      if (status === "Собрано" || status === "Подтвержден") {
        setIzlishkaCount(prev => {
          const nextCount = prev + 1;
          localStorage.setItem(`izlishka_count_${userName}_${todayStr}`, nextCount.toString());
          return nextCount;
        });
      }
    } else {
      setCompletedCount(prev => {
        const nextCount = prev + 1;
        localStorage.setItem(`audit_count_${userName}_${todayStr}`, nextCount.toString());
        return nextCount;
      });
    }

    // If queue is getting low (<= 5), fetch more in the background so user never waits
    if (itemQueue.length - 1 <= 5) {
      fetchItems(true, selectedFloor, shift, activeMode);
    }

    const now = new Date();
    const formattedTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    try {
      await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rowIndex: currentItem.rowIndex, 
          status, 
          userName, 
          shift: `${shift} смена`, 
          shiftName: `${shift} смена`, 
          placementCorrect,
          timestamp: formattedTimestamp,
          mode: activeMode,
          floor: selectedFloor
        }),
      });
      // We don't need to await or do anything here. If it succeeds, great.
    } catch (err) {
      console.error("Failed to update item:", err);
      // Optional: Add it back to the queue if it fails, or show a small toast error
    }
  };

  const renderStatsModal = () => {
    if (!showStats) return null;

    return (
      <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden text-left">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2.5 mb-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">📊</span>
              <div>
                <h2 className="text-sm sm:text-base font-black text-white leading-none">Статистика смен</h2>
                <p className="text-[10px] text-neutral-400 mt-1">План на день: 600 SKU на каждую смену</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetchStats(true);
                  playSound("click");
                }}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[10px] font-bold rounded-lg transition active:scale-95 flex items-center gap-1 border border-neutral-700"
                title="Обновить данные"
              >
                🔄 Обновить
              </button>
              <button
                onClick={() => {
                  setShowStats(false);
                  playSound("click");
                }}
                className="p-1 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Navigation Bar between Stats */}
          <div className="mb-3 flex items-center justify-center gap-2 bg-neutral-950/60 p-1.5 rounded-xl border border-neutral-800 text-[10px] font-bold shrink-0">
            <button
              className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm"
            >
              📊 Смены
            </button>

            <button
              onClick={() => {
                setShowStats(false);
                setShowGotovaStats(true);
                fetchGotovaStats();
                playSound("click");
              }}
              className="px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              📈 Аналитика
            </button>
          </div>

          {/* Date Selector Filter */}
          {!loadingStats && !statsError && statsData && Object.keys(statsData).length > 0 && (
            <div className="mb-3 bg-neutral-800/30 border border-neutral-800/80 p-2.5 rounded-xl flex items-center justify-between gap-3 shrink-0 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400 font-semibold">Фильтр:</span>
                {selectedDateStr && (
                  <button
                    onClick={() => {
                      setSelectedDateStr("");
                      playSound("click");
                    }}
                    className="bg-red-950/80 hover:bg-red-900 border border-red-500/30 px-1.5 py-0.5 rounded text-[9px] text-white font-bold transition active:scale-95"
                  >
                    Сбросить
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDateStr}
                  onChange={(e) => {
                    setSelectedDateStr(e.target.value);
                    playSound("click");
                  }}
                  className="bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-[10px] cursor-pointer select-none"
                />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            {loadingStats && (
              <div className="py-12 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mb-2"></div>
                <p className="text-xs text-neutral-400 font-medium animate-pulse">Загрузка данных из таблицы...</p>
              </div>
            )}

            {statsError && (
              <div className="py-8 text-center">
                <p className="text-red-400 font-bold text-xs mb-2">⚠️ {statsError}</p>
                <button
                  onClick={fetchStats}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[10px] font-bold rounded-lg transition"
                >
                  Повторить попытку
                </button>
              </div>
            )}

            {!loadingStats && !statsError && statsData && (
              <div className="flex flex-col gap-3">
                {(() => {
                  const filteredDates = Object.keys(statsData).filter(
                    (dateStr) => !selectedDateStr || dateStr === selectedDateStr
                  );

                  if (filteredDates.length === 0) {
                    return (
                      <div className="text-center py-10">
                        <p className="text-neutral-500 text-xs">Нет данных о проделанной работе за выбранную дату.</p>
                        {selectedDateStr && (
                          <button
                            onClick={() => {
                              setSelectedDateStr("");
                              playSound("click");
                            }}
                            className="mt-2.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition active:scale-95"
                          >
                            Показать все дни
                          </button>
                        )}
                      </div>
                    );
                  }

                  return filteredDates
                    .sort((a, b) => new Date(b) - new Date(a)) // Sort dates descending
                    .map((dateStr) => {
                      const dayData = statsData[dateStr];
                      const formattedDate = new Date(dateStr).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      });

                      return (
                        <div key={dateStr} className="bg-neutral-800/30 border border-neutral-800/80 rounded-xl p-3">
                          <h3 className="text-xs font-extrabold text-amber-400 mb-2 border-b border-neutral-800/60 pb-1">
                            📅 {formattedDate}
                          </h3>
                          <div className="grid grid-cols-2 gap-2.5 items-start">
                            {["1 смена", "2 смена", "3 смена", "4 смена"].map((shiftName) => {
                              const matchingKey = Object.keys(dayData).find(
                                k => k.replace(/\s+/g, '').toLowerCase() === shiftName.replace(/\s+/g, '').toLowerCase()
                              ) || shiftName;
                              
                              const isObject = typeof dayData[matchingKey] === "object" && dayData[matchingKey] !== null;
                              const count = isObject ? (dayData[matchingKey].total || 0) : (dayData[matchingKey] || 0);
                              
                              const confirmed = isObject ? (dayData[matchingKey].confirmed || 0) : 0;
                              const missing = isObject ? (dayData[matchingKey].missing || 0) : 0;
                              const placementCorrect = isObject ? (dayData[matchingKey].placementCorrect || 0) : 0;
                              const users = isObject ? (dayData[matchingKey].users || {}) : {};
                              
                              const pctConfirmed = count > 0 ? Math.round((confirmed / count) * 100) : 0;
                              const pctMissing = count > 0 ? Math.round((missing / count) * 100) : 0;
                              const pctPlacement = confirmed > 0 ? Math.round((placementCorrect / confirmed) * 100) : 0;

                              const target = 600;
                              const pct = Math.min(Math.round((count / target) * 100), 100);
                              const isCompleted = count >= target;

                              return (
                                <div key={shiftName} className="bg-neutral-900/40 border border-neutral-800/80 rounded-lg p-2 flex flex-col justify-start gap-1.5 text-[10px]">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-neutral-200 text-[10px]">{shiftName}</span>
                                    <div className="flex items-center gap-1 font-mono">
                                      <span className={`font-black ${isCompleted ? 'text-emerald-400' : 'text-neutral-300'}`}>
                                        {count}
                                      </span>
                                      <span className="text-neutral-500">/{target}</span>
                                      <span className="text-blue-400 font-extrabold text-[9px] ml-0.5">({pct}%)</span>
                                      {isCompleted && (
                                        <span className="bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded font-black text-[8px] animate-pulse ml-0.5">Plan! ✅</span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Progress bar */}
                                  <div className="w-full h-1 bg-neutral-950 rounded-full overflow-hidden mb-1.5">
                                    <div
                                      className={`h-full transition-all duration-500 rounded-full ${
                                        isCompleted
                                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                          : pct > 75
                                          ? 'bg-gradient-to-r from-blue-500 to-emerald-400'
                                          : pct > 30
                                          ? 'bg-gradient-to-r from-amber-500 to-blue-400'
                                          : 'bg-gradient-to-r from-red-500 to-amber-400'
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>

                                  {/* Sub-stats for status and placement */}
                                  {isObject && count > 0 ? (
                                    <>
                                      <div className="grid grid-cols-3 gap-1 mt-1 border-t border-neutral-850 pt-1 text-[9px] leading-tight">
                                        <div className="flex flex-col">
                                          <span className="text-neutral-500 text-[8px] font-bold">Найдено</span>
                                          <span className="text-emerald-400 font-bold mt-0.5 truncate">{confirmed}шт ({pctConfirmed}%)</span>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-neutral-500 text-[8px] font-bold">Отсутств.</span>
                                          <span className="text-red-400 font-bold mt-0.5 truncate">{missing}шт ({pctMissing}%)</span>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-neutral-500 text-[8px] font-bold">Прав. разм.</span>
                                          <span className="text-amber-400 font-bold mt-0.5 truncate">{placementCorrect}шт ({pctPlacement}%)</span>
                                        </div>
                                      </div>

                                      {/* Employees list */}
                                      {users && Object.keys(users).length > 0 && (
                                        <div className="mt-1.5 border-t border-neutral-850 pt-1.5 flex flex-col gap-1 text-[10px]">
                                          <span className="text-neutral-400 text-[9px] font-extrabold block mb-0.5 uppercase tracking-wider">Сотрудники:</span>
                                          <div className="flex flex-col gap-1 leading-none">
                                            {Object.keys(users).map((u) => {
                                              const uVal = users[u];
                                              const isObj = typeof uVal === "object" && uVal !== null;
                                              const uSku = isObj ? (uVal.sku || uVal.total || 0) : (uVal || 0);
                                              const uQty = isObj ? (uVal.qty || uVal.total || 0) : uSku;
                                              const uConf = isObj ? (uVal.confirmedQty || uVal.confirmed || 0) : uQty;
                                              const uMiss = isObj ? (uVal.missingQty || uVal.missing || 0) : 0;
                                              const uPlac = isObj ? (uVal.placementCorrect || 0) : 0;
                                              
                                              return (
                                                <div key={u} className="flex justify-between items-center text-neutral-200 py-0.5 text-[9px]">
                                                  <span className="font-bold text-neutral-100 truncate max-w-[65%]" title={u}>{u}</span>
                                                  <span className="font-mono text-amber-400 font-black text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                    {uQty} SKU
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex justify-between items-center text-[9px] text-neutral-500 italic mt-1 border-t border-neutral-850 pt-1">
                                      <span>{pct}% выполнено</span>
                                      <span>{count === 0 && "Работа не начата"}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </div>
          
          <div className="mt-2.5 pt-2 border-t border-neutral-800 flex justify-end shrink-0">
            <button
              onClick={() => {
                setShowStats(false);
                playSound("click");
              }}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[10px] font-bold transition active:scale-95"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGotovaStatsModal = () => {
    if (!showGotovaStats) return null;

    const monthlyKeys = gotovaStatsData && gotovaStatsData.monthly ? Object.keys(gotovaStatsData.monthly).sort((a, b) => b.localeCompare(a)) : [];
    const currentMonth = selectedGotovaMonth || (monthlyKeys.length > 0 ? monthlyKeys[0] : "");
    const monthlyData = currentMonth && gotovaStatsData.monthly ? gotovaStatsData.monthly[currentMonth] : null;

    const formatMonthName = (mKey) => {
      if (!mKey) return "";
      const [year, month] = mKey.split("-");
      const monthsRu = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
      return `${monthsRu[parseInt(month) - 1]} ${year}`;
    };

    return (
      <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[96vh] overflow-hidden text-left">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2.5 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">📈</span>
              <div>
                <h2 className="text-sm sm:text-base font-black text-white leading-none">Аналитика Готовых Отчетов</h2>
                <p className="text-[10px] text-neutral-400 mt-1">Обобщенная статистика из листа &apos;Готовы&apos;</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetchGotovaStats(true);
                  playSound("click");
                }}
                className="px-2 py-1 bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 text-[10px] font-bold rounded-lg transition active:scale-95 flex items-center gap-1"
                title="Обновить данные"
              >
                🔄 Обновить
              </button>
              <button
                onClick={() => {
                  setShowGotovaStats(false);
                  playSound("click");
                }}
                className="p-1 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Navigation Bar between Stats */}
          <div className="mb-3 flex items-center justify-center gap-2 bg-neutral-950/60 p-1.5 rounded-xl border border-neutral-800 text-[10px] font-bold shrink-0">
            <button
              onClick={() => {
                setShowGotovaStats(false);
                setShowStats(true);
                fetchStats();
                playSound("click");
              }}
              className="px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              📊 Смены
            </button>

            <button
              className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
            >
              📈 Аналитика
            </button>
          </div>

          {/* Month Selector Filter */}
          {!loadingGotovaStats && !gotovaStatsError && monthlyKeys.length > 0 && (
            <div className="mb-3 bg-neutral-800/30 border border-neutral-800/80 p-2.5 rounded-xl flex items-center justify-between gap-3 shrink-0 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400 font-semibold">Выберите месяц:</span>
              </div>
              <select
                value={currentMonth}
                onChange={(e) => {
                  setSelectedGotovaMonth(e.target.value);
                  playSound("click");
                }}
                className="bg-neutral-850 border border-neutral-700 rounded-lg px-2.5 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold text-[10px] cursor-pointer"
              >
                {monthlyKeys.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    {formatMonthName(mKey)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            {loadingGotovaStats && (
              <div className="py-16 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-purple-500 mb-2"></div>
                <p className="text-xs text-neutral-400 font-medium animate-pulse">Загрузка данных готовых отчетов...</p>
              </div>
            )}

            {gotovaStatsError && (
              <div className="py-12 text-center">
                <p className="text-red-400 font-bold text-xs mb-3">⚠️ {gotovaStatsError}</p>
                <button
                  onClick={fetchGotovaStats}
                  className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[10px] font-bold rounded-lg transition"
                >
                  Повторить попытку
                </button>
              </div>
            )}

            {!loadingGotovaStats && !gotovaStatsError && !monthlyData && (
              <div className="py-16 text-center text-neutral-500 text-xs">
                Нет обработанных данных в листе &apos;Готовы&apos;.
              </div>
            )}

            {!loadingGotovaStats && !gotovaStatsError && monthlyData && (
              <div className="flex flex-col gap-4">
                
                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:gap-3 shrink-0">
                  {/* Card 1: Total */}
                  <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-2.5 flex flex-col justify-between col-span-2 sm:col-span-1">
                    <span className="text-[9px] text-purple-400 font-black uppercase tracking-wider">Общий объем</span>
                    <span className="text-xl md:text-2xl font-black text-white mt-1 leading-none">
                      {monthlyData.total}
                    </span>
                    <span className="text-[8px] text-neutral-400 mt-1">Всего сделано (SKU)</span>
                  </div>

                  {/* Card 2: Confirmed */}
                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-2.5 flex flex-col justify-between">
                    <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider">Найденные</span>
                    <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 leading-none">
                      {monthlyData.confirmed}
                    </span>
                    <span className="text-[8px] text-neutral-400 mt-1">
                      {monthlyData.total > 0 ? Math.round((monthlyData.confirmed / monthlyData.total) * 100) : 0}% найдено
                    </span>
                  </div>

                  {/* Card 3: Missing */}
                  <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-2.5 flex flex-col justify-between">
                    <span className="text-[9px] text-red-400 font-black uppercase tracking-wider">Не найденные</span>
                    <span className="text-xl md:text-2xl font-black text-red-400 mt-1 leading-none">
                      {monthlyData.missing}
                    </span>
                    <span className="text-[8px] text-neutral-400 mt-1">
                      {monthlyData.total > 0 ? Math.round((monthlyData.missing / monthlyData.total) * 100) : 0}% не найдено
                    </span>
                  </div>

                  {/* Card 4: Placement accuracy */}
                  <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-2.5 flex flex-col justify-between">
                    <span className="text-[9px] text-blue-400 font-black uppercase tracking-wider">Верно размещено</span>
                    <span className="text-xl md:text-2xl font-black text-blue-400 mt-1 leading-none">
                      {monthlyData.placementCorrect}
                    </span>
                    <span className="text-[8px] text-neutral-400 mt-1">
                      {monthlyData.confirmed > 0 ? Math.round((monthlyData.placementCorrect / monthlyData.confirmed) * 100) : 0}% точность полки
                    </span>
                  </div>

                  {/* Card 5: Placement incorrect */}
                  <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-2.5 flex flex-col justify-between">
                    <span className="text-[9px] text-amber-400 font-black uppercase tracking-wider">Неверно размещено</span>
                    <span className="text-xl md:text-2xl font-black text-amber-400 mt-1 leading-none">
                      {monthlyData.placementIncorrect || 0}
                    </span>
                    <span className="text-[8px] text-neutral-400 mt-1">
                      {monthlyData.confirmed > 0 ? Math.round(((monthlyData.placementIncorrect || 0) / monthlyData.confirmed) * 100) : 0}% от найденных
                    </span>
                  </div>
                </div>

                {/* Shifts section: bar chart + table list */}
                <div className="bg-neutral-850 border border-neutral-800 rounded-xl p-3 flex flex-col">
                  <h4 className="text-[10px] font-bold text-neutral-300 uppercase tracking-wider mb-2">📊 Статистика по сменам</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    {/* Left: SVG Bar Chart */}
                    <div className="flex items-center justify-center min-h-[140px]">
                      {(() => {
                        const shiftData = monthlyData.shifts || {};
                        const shiftKeys = ["1 смена", "2 смена", "3 смена", "4 смена"];
                        const maxShiftVal = Math.max(...shiftKeys.map(s => (shiftData[s] ? shiftData[s].total : 0)), 1);
                        const svgWidth = 280;
                        const svgHeight = 130;
                        const chartBottom = 105;
                        const chartHeight = 80;
                        const spacing = svgWidth / (shiftKeys.length + 1);

                        return (
                          <svg className="w-full h-full max-h-[140px]" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                            {/* Grid lines */}
                            {[0.33, 0.66, 1].map((ratio, idx) => {
                              const y = chartBottom - ratio * chartHeight;
                              const val = Math.round(ratio * maxShiftVal);
                              return (
                                <g key={idx}>
                                  <line x1="30" y1={y} x2={svgWidth - 10} y2={y} stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />
                                  <text x="25" y={y + 3} textAnchor="end" fill="#525252" className="text-[8px] font-mono">{val}</text>
                                </g>
                              );
                            })}

                            <line x1="30" y1={chartBottom} x2={svgWidth - 10} y2={chartBottom} stroke="#404040" strokeWidth="1" />

                            {shiftKeys.map((sName, idx) => {
                              const sStats = shiftData[sName] || { total: 0, confirmed: 0, missing: 0 };
                              const total = sStats.total || 0;
                              const confirmed = sStats.confirmed || 0;
                              const barX = 30 + (idx + 0.5) * spacing;
                              const barW = 20;

                              const hTotal = (total / maxShiftVal) * chartHeight;
                              const yTotal = chartBottom - hTotal;
                              
                              const hConf = (confirmed / maxShiftVal) * chartHeight;
                              const yConf = chartBottom - hConf;

                              return (
                                <g key={idx}>
                                  <rect x={barX - barW/2} y={yTotal} width={barW} height={hTotal} fill="#4f46e5" rx="2" className="opacity-80" />
                                  <rect x={barX - barW/2 + 1.5} y={yConf} width={barW - 3} height={hConf} fill="#10b981" rx="1.5" className="opacity-95" />

                                  <text x={barX} y={yTotal - 3} textAnchor="middle" fill="#a3a3a3" className="text-[8px] font-bold font-mono">{total}</text>
                                  <text x={barX} y={chartBottom + 12} textAnchor="middle" fill="#d4d4d4" className="text-[9px] font-extrabold">{sName.replace(" смена", " см.")}</text>
                                </g>
                              );
                            })}
                          </svg>
                        );
                      })()}
                    </div>

                    {/* Right: Detailed Table */}
                    <div>
                      {(() => {
                        const shiftData = monthlyData.shifts || {};
                        const shiftKeys = ["1 смена", "2 смена", "3 смена", "4 смена"];

                        return (
                          <table className="w-full text-[10px] text-neutral-300 border-collapse">
                            <thead>
                              <tr className="border-b border-neutral-800 text-left text-neutral-500 uppercase tracking-wider">
                                <th className="pb-1.5 font-black">Смена</th>
                                <th className="pb-1.5 font-black text-center">Всего SKU</th>
                                <th className="pb-1.5 font-black text-center text-emerald-400">Найдено</th>
                                <th className="pb-1.5 font-black text-center text-red-400">Не найдено</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shiftKeys.map((sName) => {
                                const sStats = shiftData[sName] || { total: 0, confirmed: 0, missing: 0 };
                                return (
                                  <tr key={sName} className="border-b border-neutral-800/40 hover:bg-neutral-800/10">
                                    <td className="py-1.5 font-bold text-white">{sName}</td>
                                    <td className="py-1.5 text-center font-mono font-bold">{sStats.total}</td>
                                    <td className="py-1.5 text-center text-emerald-400 font-mono font-bold">{sStats.confirmed}</td>
                                    <td className="py-1.5 text-center text-red-400 font-mono font-bold">{sStats.missing || (sStats.total - sStats.confirmed)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Footer close */}
          <div className="mt-3 border-t border-neutral-800 pt-2.5 flex justify-end shrink-0">
            <button
              onClick={() => {
                setShowGotovaStats(false);
                playSound("click");
              }}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[10px] font-bold transition active:scale-95"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderIzlishkaStatsModal = () => {
    if (!showIzlishkaStats) return null;

    return (
      <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[96vh] overflow-hidden text-left">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2.5 mb-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">📦</span>
              <div>
                <h2 className="text-sm sm:text-base font-black text-emerald-400 leading-none">
                  Ежедневная статистика излишков
                </h2>
                <p className="text-[10px] text-neutral-400 mt-1">
                  Выполненная работа по сотрудникам (&quot;Кто сколько сделал&quot;)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetchStats(true);
                  playSound("click");
                }}
                className="px-2 py-1 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold rounded-lg transition active:scale-95 flex items-center gap-1"
                title="Обновить свежие данные"
              >
                🔄 Обновить
              </button>
              <button
                onClick={() => {
                  setShowIzlishkaStats(false);
                  playSound("click");
                }}
                className="p-1 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Navigation Bar between Stats */}
          <div className="mb-3 flex items-center justify-center gap-2 bg-neutral-950/60 p-1.5 rounded-xl border border-neutral-800 text-[10px] font-bold shrink-0">
            <button
              onClick={() => {
                setShowIzlishkaStats(false);
                setShowStats(true);
                fetchStats();
                playSound("click");
              }}
              className="px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              📊 Смены
            </button>
            <button
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
            >
              📦 Излишка
            </button>
            <button
              onClick={() => {
                setShowIzlishkaStats(false);
                setShowGotovaStats(true);
                fetchGotovaStats();
                playSound("click");
              }}
              className="px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              📈 Аналитика
            </button>
          </div>

          {/* Date Selector Filter */}
          {!loadingStats && !statsError && statsData && Object.keys(statsData).length > 0 && (
            <div className="mb-3 bg-neutral-800/30 border border-neutral-800/80 p-2.5 rounded-xl flex items-center justify-between gap-3 shrink-0 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400 font-semibold">Фильтр по дате:</span>
                {selectedIzlishkaDateStr && (
                  <button
                    onClick={() => {
                      setSelectedIzlishkaDateStr("");
                      playSound("click");
                    }}
                    className="bg-red-950/80 hover:bg-red-900 border border-red-500/30 px-1.5 py-0.5 rounded text-[9px] text-white font-bold transition active:scale-95"
                  >
                    Все дни
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="date"
                  value={selectedIzlishkaDateStr}
                  onChange={(e) => {
                    setSelectedIzlishkaDateStr(e.target.value);
                    playSound("click");
                  }}
                  className="bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-[10px] cursor-pointer select-none"
                />
              </div>
            </div>
          )}

          {/* Main Scrollable Content */}
          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            {loadingStats && (
              <div className="py-12 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 mb-2"></div>
                <p className="text-xs text-neutral-400 font-medium animate-pulse">Загрузка статистики излишков...</p>
              </div>
            )}

            {statsError && (
              <div className="py-8 text-center">
                <p className="text-red-400 font-bold text-xs mb-2">⚠️ {statsError}</p>
                <button
                  onClick={fetchStats}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[10px] font-bold rounded-lg transition"
                >
                  Повторить попытку
                </button>
              </div>
            )}

            {!loadingStats && !statsError && statsData && (
              <div className="flex flex-col gap-3">
                {(() => {
                  const izlishkaDates = Object.keys(statsData).filter((dateStr) => {
                    if (selectedIzlishkaDateStr && dateStr !== selectedIzlishkaDateStr) return false;
                    const dayObj = statsData[dateStr];
                    if (!dayObj) return false;
                    const izKey = Object.keys(dayObj).find(
                      k => k.toLowerCase() === "излишка" || k.toLowerCase() === "izlishka" || k.toLowerCase() === "излишки"
                    );
                    return !!izKey && (dayObj[izKey].total > 0 || Object.keys(dayObj[izKey].users || {}).length > 0);
                  });

                  if (izlishkaDates.length === 0) {
                    return (
                      <div className="text-center py-10 bg-neutral-800/20 border border-neutral-800 rounded-xl p-4">
                        <span className="text-3xl block mb-2">📦</span>
                        <p className="text-neutral-400 text-xs font-semibold">
                          {selectedIzlishkaDateStr
                            ? "За выбранную дату нет данных по излишкам."
                            : "Данные по сборке излишков пока отсутствуют."}
                        </p>
                        {selectedIzlishkaDateStr && (
                          <button
                            onClick={() => {
                              setSelectedIzlishkaDateStr("");
                              playSound("click");
                            }}
                            className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition active:scale-95"
                          >
                            Показать все дни
                          </button>
                        )}
                      </div>
                    );
                  }

                  return izlishkaDates
                    .sort((a, b) => new Date(b) - new Date(a))
                    .map((dateStr) => {
                      const dayObj = statsData[dateStr];
                      const izKey = Object.keys(dayObj).find(
                        k => k.toLowerCase() === "излишка" || k.toLowerCase() === "izlishka" || k.toLowerCase() === "излишки"
                      );
                      const izData = dayObj[izKey] || { total: 0, confirmed: 0, missing: 0, users: {} };
                      
                      const formattedDate = new Date(dateStr).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      });

                      const totalSkus = izData.total || 0;
                      const totalQty = izData.totalQty || totalSkus;
                      const confirmedSkus = izData.confirmed || 0;
                      const confirmedQty = izData.confirmedQty || confirmedSkus;
                      const missingSkus = izData.missing || 0;
                      const missingQty = izData.missingQty || missingSkus;

                      const usersMap = izData.users || {};

                      const userEntries = Object.entries(usersMap).map(([uName, uVal]) => {
                        const isObj = typeof uVal === "object" && uVal !== null;
                        const uSku = isObj ? (uVal.sku || uVal.total || 0) : (uVal || 0);
                        const uQty = isObj ? (uVal.qty || uVal.total || 0) : uSku;
                        const uConfirmedSku = isObj ? (uVal.confirmedSku || uVal.confirmed || 0) : uSku;
                        const uConfirmedQty = isObj ? (uVal.confirmedQty || uVal.confirmed || 0) : uQty;
                        const uMissingSku = isObj ? (uVal.missingSku || uVal.missing || 0) : 0;
                        const uMissingQty = isObj ? (uVal.missingQty || uVal.missing || 0) : 0;
                        return { uName, uSku, uQty, uConfirmedSku, uConfirmedQty, uMissingSku, uMissingQty };
                      }).sort((a, b) => b.uQty - a.uQty);

                      const activeWorkerCount = userEntries.length;
                      const topUser = userEntries.length > 0 ? userEntries[0] : null;

                      return (
                        <div key={dateStr} className="bg-neutral-800/40 border border-neutral-800/90 rounded-2xl p-3.5 shadow-md">
                          {/* Date & Overall Header */}
                          <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-700/60">
                            <div>
                              <h3 className="text-xs sm:text-sm font-black text-amber-400 flex items-center gap-1.5">
                                📅 <span>{formattedDate}</span>
                              </h3>
                              <p className="text-[10px] text-neutral-400 mt-0.5">
                                Итого собрано: <strong className="text-emerald-400 font-extrabold">{totalSkus} SKU ({totalQty} шт)</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold px-2 py-0.5 rounded-lg">
                                Найдено: {confirmedSkus} SKU ({confirmedQty} шт)
                              </span>
                              {missingSkus > 0 && (
                                <span className="bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold px-2 py-0.5 rounded-lg">
                                  Отсутствует: {missingSkus} SKU ({missingQty} шт)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Summary Widgets */}
                          <div className="grid grid-cols-4 gap-1.5 mb-3">
                            <div className="bg-neutral-900/60 border border-neutral-800 p-2 rounded-xl text-center">
                              <span className="text-[8px] text-neutral-400 font-bold block uppercase">SKU (Поз.)</span>
                              <span className="text-xs sm:text-sm font-black text-amber-400">{totalSkus} SKU</span>
                            </div>
                            <div className="bg-neutral-900/60 border border-neutral-800 p-2 rounded-xl text-center">
                              <span className="text-[8px] text-neutral-400 font-bold block uppercase">Количество</span>
                              <span className="text-xs sm:text-sm font-black text-emerald-400">{totalQty} шт</span>
                            </div>
                            <div className="bg-neutral-900/60 border border-neutral-800 p-2 rounded-xl text-center">
                              <span className="text-[8px] text-neutral-400 font-bold block uppercase">Сотрудники</span>
                              <span className="text-xs sm:text-sm font-black text-blue-400">{activeWorkerCount} чел.</span>
                            </div>
                            <div className="bg-neutral-900/60 border border-neutral-800 p-2 rounded-xl text-center truncate">
                              <span className="text-[8px] text-neutral-400 font-bold block uppercase">Лидер дня</span>
                              <span className="text-xs sm:text-sm font-black text-amber-300 truncate block">
                                {topUser ? `${topUser.uName.split(" ")[0]} (${topUser.uQty}шт)` : "-"}
                              </span>
                            </div>
                          </div>

                          {/* Employee Leaderboard ("Kim nechta qildi") */}
                          <div>
                            <h4 className="text-[10px] font-extrabold text-neutral-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                              <span>👥 Рейтинг сотрудников (&quot;Кто сколько сделал&quot;)</span>
                              <span className="text-neutral-500 text-[9px] font-normal">{userEntries.length} чел.</span>
                            </h4>

                            {userEntries.length === 0 ? (
                              <p className="text-[10px] text-neutral-500 italic">Нет данных о сотрудниках</p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {userEntries.map((uItem, idx) => {
                                  const { uName, uSku, uQty, uConfirmedSku, uConfirmedQty, uMissingSku, uMissingQty } = uItem;
                                  const pct = totalQty > 0 ? Math.round((uQty / totalQty) * 100) : 0;
                                  
                                  let rankBadge = "👤";
                                  let rankClass = "bg-neutral-800 text-neutral-400 border-neutral-700";
                                  if (idx === 0) {
                                    rankBadge = "🥇 1 место";
                                    rankClass = "bg-amber-500/20 text-amber-300 border-amber-500/40 font-black";
                                  } else if (idx === 1) {
                                    rankBadge = "🥈 2 место";
                                    rankClass = "bg-slate-400/20 text-slate-300 border-slate-400/40 font-black";
                                  } else if (idx === 2) {
                                    rankBadge = "🥉 3 место";
                                    rankClass = "bg-amber-700/20 text-amber-500 border-amber-700/40 font-black";
                                  } else {
                                    rankBadge = `${idx + 1} место`;
                                  }

                                  return (
                                    <div
                                      key={uName}
                                      className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-2 flex flex-col gap-1.5 text-[11px]"
                                    >
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 min-w-0 pr-2">
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${rankClass} shrink-0`}>
                                            {rankBadge}
                                          </span>
                                          <span className="font-extrabold text-white truncate" title={uName}>
                                            {uName}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 font-mono">
                                          <span className="font-black text-amber-400 text-[11px] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                            {uSku} SKU <span className="text-emerald-400 ml-1">({uQty} шт)</span>
                                          </span>
                                          <span className="text-[10px] text-neutral-400 font-bold w-10 text-right">
                                            ({pct}%)
                                          </span>
                                        </div>
                                      </div>

                                      {/* Detailed status breakdown per employee */}
                                      <div className="flex items-center gap-2 text-[9px] font-semibold text-neutral-300 bg-neutral-950/40 px-2 py-1 rounded-lg border border-neutral-850">
                                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                                          ✓ Найдено: <strong className="font-extrabold font-mono text-emerald-300">{uConfirmedSku} SKU ({uConfirmedQty} шт)</strong>
                                        </span>
                                        <span className="text-neutral-600">|</span>
                                        <span className="text-red-400 font-bold flex items-center gap-1">
                                          ✗ Отсутствует: <strong className="font-extrabold font-mono text-red-300">{uMissingSku} SKU ({uMissingQty} шт)</strong>
                                        </span>
                                      </div>

                                      {/* Individual Progress bar */}
                                      <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full transition-all duration-500 rounded-full ${
                                            idx === 0
                                              ? 'bg-gradient-to-r from-amber-500 via-emerald-400 to-teal-300'
                                              : idx === 1
                                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                              : 'bg-gradient-to-r from-teal-600 to-emerald-500'
                                          }`}
                                          style={{ width: `${Math.max(pct, 2)}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </div>

          {/* Footer close */}
          <div className="mt-3 border-t border-neutral-800 pt-2.5 flex justify-between items-center shrink-0">
            <button
              onClick={() => {
                fetchStats();
                playSound("click");
              }}
              className="text-[10px] text-neutral-400 hover:text-white font-bold flex items-center gap-1 transition"
            >
              🔄 Обновить
            </button>
            <button
              onClick={() => {
                setShowIzlishkaStats(false);
                playSound("click");
              }}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[10px] font-bold transition active:scale-95"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  };




  const renderOrientationOverlay = () => {
    return null;
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen bg-neutral-900 text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
        </div>
        {renderOrientationOverlay()}
      </>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <div className="w-full h-full bg-neutral-900 text-white p-4 font-sans flex items-center justify-center overflow-hidden">
          {/* Form container */}
          <div className="w-full max-w-md bg-neutral-800 rounded-2xl shadow-2xl p-6 border border-neutral-700 flex flex-col justify-center">
            <h2 className="text-xl font-bold mb-3">Авторизация</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Ф.И.О. сотрудника</label>
                <input 
                  type="text" 
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Например: Иванов Иван"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-neutral-700 border border-neutral-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Смена</label>
                <div className="grid grid-cols-4 gap-2">
                  {["1", "2", "3", "4"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setShiftInput(s);
                        playSound("click");
                      }}
                      className={`py-2 rounded-xl font-bold text-sm transition-all ${
                        shiftInput === s
                          ? "bg-blue-600 text-white shadow-lg border-2 border-blue-400 scale-[1.02]"
                          : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600 border border-neutral-600"
                      }`}
                    >
                      {s} смена
                    </button>
                  ))}
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-2.5 mt-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-blue-500/30"
              >
                Войти
              </button>
            </form>
            
            {/* Statistics buttons */}
            <div className="mt-4 pt-3 border-t border-neutral-700 flex justify-center gap-2.5 items-center flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setShowStats(true);
                  fetchStats();
                  playSound("click");
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-all active:scale-95"
              >
                📊 Смены
              </button>
              <span className="text-neutral-600">|</span>
              <button
                type="button"
                onClick={() => {
                  setShowIzlishkaStats(true);
                  fetchStats();
                  playSound("click");
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition-all active:scale-95"
              >
                📦 Излишка
              </button>
              <span className="text-neutral-600">|</span>
              <button
                type="button"
                onClick={() => {
                  setShowGotovaStats(true);
                  fetchGotovaStats();
                  playSound("click");
                }}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 transition-all active:scale-95"
              >
                📈 Аналитика
              </button>
            </div>

          </div>
        </div>
        {renderOrientationOverlay()}
        {renderStatsModal()}
        {renderGotovaStatsModal()}
        {renderIzlishkaStatsModal()}

      </>
    );
  }

  if (isLoggedIn && !activeMode) {
    return (
      <>
        <div className="w-full h-full bg-neutral-900 text-white p-4 font-sans flex items-center justify-center overflow-hidden">
          {/* Main Container */}
          <div className="w-full max-w-md bg-neutral-800 rounded-2xl shadow-2xl p-6 border border-neutral-700 flex flex-col">
            
            {/* Header: Title and Subtitle */}
            <div className="mb-3 text-center">
              <h1 className="text-2xl font-black text-amber-400">Выберите режим работы</h1>
              <p className="text-neutral-400 text-xs mt-1">Выберите необходимый модуль для начала работы</p>
            </div>

            {/* Employee card with Logout button */}
            <div className="mb-4 p-3 bg-neutral-700/30 border border-neutral-700/50 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="text-neutral-400 text-[9px] uppercase font-bold block">Сотрудник</span>
                <span className="font-bold text-white truncate max-w-[180px] block">{userName}</span>
                <span className="text-[10px] text-blue-400 font-semibold block mt-0.5">{shift} смена</span>
              </div>
              <button 
                onClick={() => {
                  handleLogout();
                  playSound("click");
                }} 
                className="px-3 py-1.5 bg-red-900/80 border border-red-500 text-white hover:bg-red-800 rounded-xl text-xs font-black transition active:scale-95 shadow-md shadow-red-900/30"
              >
                Выйти
              </button>
            </div>

            {/* Mode selection buttons */}
            <div className="flex flex-col gap-3 my-2">
              <button
                onClick={() => {
                  handleModeChange("proverka");
                  playSound("click");
                }}
                className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/40 to-neutral-800 hover:from-blue-800/60 border border-blue-500/40 hover:border-blue-400 text-left transition-all active:scale-[0.98] shadow-lg group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🔍</span>
                  <div>
                    <h3 className="font-black text-base text-white group-hover:text-blue-300 transition">Проверка размещения</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">Плановая проверка товаров на этажах (План: 93 SKU)</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  handleModeChange("izlishka");
                  playSound("click");
                }}
                className="p-4 rounded-2xl bg-gradient-to-r from-emerald-900/40 to-neutral-800 hover:from-emerald-800/60 border border-emerald-500/40 hover:border-emerald-400 text-left transition-all active:scale-[0.98] shadow-lg group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📦</span>
                  <div>
                    <h3 className="font-black text-base text-white group-hover:text-emerald-300 transition">Сбор излишков</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">Поиск и сбор излишков товаров по этажам</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Statistics buttons */}
            <div className="mt-4 pt-3 border-t border-neutral-700 flex justify-center gap-2.5 items-center flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setShowStats(true);
                  fetchStats();
                  playSound("click");
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-all active:scale-95"
              >
                📊 Статистика смен
              </button>

              <span className="text-neutral-600">|</span>
              <button
                type="button"
                onClick={() => {
                  setShowGotovaStats(true);
                  fetchGotovaStats();
                  playSound("click");
                }}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 transition-all active:scale-95"
              >
                📈 Аналитика (Готова)
              </button>
            </div>


          </div>
        </div>
        {renderOrientationOverlay()}
        {renderStatsModal()}
        {renderGotovaStatsModal()}
        {renderIzlishkaStatsModal()}

      </>
    );
  }

  if (isLoggedIn && activeMode && !selectedFloor) {
    return (
      <>
        <div className="w-full h-full bg-neutral-900 text-white p-4 font-sans flex items-center justify-center overflow-hidden">
          {/* Main Container */}
          <div className="w-full max-w-md bg-neutral-800 rounded-2xl shadow-2xl p-6 border border-neutral-700 flex flex-col">
            
            {/* Header: Title and Subtitle */}
            <div className="mb-2 flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black text-amber-400">Выберите этаж</h1>
                <p className="text-neutral-400 text-xs mt-0.5">Укажите этаж для работы</p>
              </div>
              <button
                onClick={() => {
                  setActiveMode("");
                  localStorage.removeItem("activeMode");
                  playSound("click");
                }}
                className="text-xs bg-neutral-700 hover:bg-neutral-600 px-2.5 py-1 rounded-lg text-amber-400 font-bold border border-neutral-600 transition active:scale-95"
              >
                Сменить режим
              </button>
            </div>

            {/* Active Mode Banner */}
            <div className="mb-3 px-3 py-1.5 bg-neutral-900/60 border border-neutral-700 rounded-xl flex items-center gap-2 text-xs">
              <span className="text-neutral-400 font-medium">Режим:</span>
              <span className={`font-black ${activeMode === 'izlishka' ? 'text-emerald-400' : 'text-blue-400'}`}>
                {activeMode === "izlishka" ? "📦 Сбор излишков" : "🔍 Проверка размещения"}
              </span>
            </div>

            {/* Employee card with Logout button */}
            <div className="mb-4 p-3 bg-neutral-700/30 border border-neutral-700/50 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="text-neutral-400 text-[9px] uppercase font-bold block">Сотрудник</span>
                <span className="font-bold text-white truncate max-w-[180px] block">{userName}</span>
                <span className="text-[10px] text-blue-400 font-semibold block mt-0.5">{shift} смена</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                  setShowStats(true);
                  fetchStats();
                  playSound("click");
                }}
                className="px-2.5 py-2.5 bg-neutral-850 hover:bg-neutral-800 border border-neutral-700 rounded-xl text-xs font-bold text-neutral-300 hover:text-white transition active:scale-95 flex items-center gap-1"
              >
                📊 Статистика
              </button>

                <button 
                  onClick={() => {
                    handleLogout();
                    playSound("click");
                  }} 
                  className="px-3 py-2.5 bg-red-900/80 border border-red-500 text-white hover:bg-red-800 rounded-xl text-xs font-black transition active:scale-95 shadow-md shadow-red-900/30"
                >
                  Выйти
                </button>
              </div>
            </div>

            {/* Floor selector buttons */}
            <div className="grid grid-cols-3 gap-3">
              {(activeMode === "izlishka" ? ["M1", "M2", "M3", "M4", "M5", "СГТ"] : ["M1", "M2", "M3", "M4", "M5"]).map((floorVal) => (
                <button
                  key={floorVal}
                  onClick={() => {
                    handleFloorChange(floorVal);
                    playSound("click");
                  }}
                  className={`py-5 rounded-2xl font-black text-2xl transition-all active:scale-95 border shadow-md ${
                    floorVal === "СГТ"
                      ? "bg-purple-900/60 text-purple-200 hover:bg-purple-600 hover:text-white border-purple-500/50 hover:border-purple-400"
                      : "bg-neutral-700 text-neutral-200 hover:bg-amber-500 hover:text-neutral-900 border-neutral-600 hover:border-amber-400"
                  }`}
                >
                  {floorVal}
                </button>
              ))}
            </div>

          </div>
        </div>
        {renderOrientationOverlay()}
        {renderStatsModal()}
        {renderGotovaStatsModal()}
        {renderIzlishkaStatsModal()}

      </>
    );
  }

  return (
    <>
      {actionToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none transition-all duration-300">
          <div className={`px-5 py-2.5 rounded-2xl shadow-2xl border flex items-center gap-2.5 font-extrabold text-xs md:text-sm backdrop-blur-xl ${
            actionToast.type === 'success' 
              ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-200 shadow-emerald-900/60 ring-2 ring-emerald-500/30' 
              : 'bg-red-950/95 border-red-500/80 text-red-200 shadow-red-900/60 ring-2 ring-red-500/30'
          }`}>
            <span className="text-lg md:text-xl animate-pulse">
              {actionToast.type === 'success' ? '⚡️' : '⚠️'}
            </span>
            <span>{actionToast.text}</span>
          </div>
        </div>
      )}
      <div className="w-full h-full bg-neutral-900 text-white p-1.5 md:p-3 font-sans flex flex-col overflow-hidden select-none">
        
        {/* Header bar showing user, floor and logout */}
        <div className="h-9 md:h-12 shrink-0 flex justify-between items-center w-full px-2 border-b border-neutral-800 mb-1.5 md:mb-2 text-xs">
          <div className="text-neutral-400 flex items-center gap-2">
            <span>
              Сотрудник: <span className="font-bold text-white">{userName}{shift ? ` (${shift} смена)` : ""}</span>
            </span>
            <span className="text-neutral-600">|</span>
            <span className="flex items-center gap-1.5">
              Этаж: <span className="font-bold text-amber-400">{selectedFloor}</span>
              <button 
                onClick={() => {
                  handleFloorChange("");
                  playSound("click");
                }}
                className="text-[10px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold px-1.5 py-0.5 rounded border border-blue-500/30 transition active:scale-95"
              >
                Сменить этаж
              </button>
            </span>
          </div>

          {/* Mode-specific progress/counter */}
          {activeMode === "izlishka" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-emerald-950/40 px-3 py-1 rounded-lg border border-emerald-500/30">
                <span className="text-[10px] md:text-xs font-bold text-neutral-200">
                  Собрано излишков: <span className="text-emerald-400 font-black text-sm">{izlishkaCount}</span> шт
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowIzlishkaStats(true);
                  fetchStats();
                  playSound("click");
                }}
                className="text-[10px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold px-2 py-1 rounded-lg border border-emerald-500/30 transition active:scale-95 flex items-center gap-1"
              >
                📦 Статистика
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-neutral-800/50 px-2.5 py-1 rounded-lg border border-neutral-800/80">
              <span className="text-[10px] font-bold text-neutral-300">
                Прогресс: <span className="text-amber-400 font-extrabold">{completedCount}</span> / {DAILY_QUOTA}
              </span>
              <div className="w-14 md:w-20 h-1.5 bg-neutral-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min((completedCount / DAILY_QUOTA) * 100, 100)}%` }}
                />
              </div>
              {completedCount >= DAILY_QUOTA ? (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded font-extrabold animate-pulse">Готово!</span>
              ) : (
                <span className="text-[9px] text-neutral-400">{Math.round((completedCount / DAILY_QUOTA) * 100)}%</span>
              )}
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] bg-neutral-800 px-2.5 py-0.5 rounded text-neutral-400 border border-neutral-700">
              В очереди: <span className="font-bold text-blue-400">{totalQueueCount}</span>
              {isFetchingBackground && <span className="ml-1.5 animate-pulse text-amber-500">...</span>}
            </span>
            <button onClick={() => {
              handleLogout();
              playSound("click");
            }} className="bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 px-3 py-1 rounded-md border border-red-500/30 text-xs font-bold transition active:scale-95">
              Выйти
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-3 overflow-hidden min-h-0">
          {error && (
            <div className="w-full bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-xl text-center flex items-center justify-center text-base">
              {error}
            </div>
          )}

          {!error && activeMode === "proverka" && showCelebration && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700 p-6 shadow-2xl relative overflow-hidden">
              {/* Decorative glowing background gradients */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              
              {/* Floating micro-animated elements */}
              <div className="text-6xl animate-bounce mb-3 select-none filter drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">🏆</div>
              
              <h2 className="text-3xl font-black bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2 tracking-wide">
                Задание выполнено! 🎉
              </h2>
              
              <p className="text-base text-neutral-200 font-bold max-w-md mb-1">
                Поздравляем, ваш план на сегодня ({DAILY_QUOTA} SKU) успешно выполнен!
              </p>
              <p className="text-xs text-neutral-400 max-w-sm mb-6">
                Всего обработано сегодня: <span className="text-emerald-400 font-extrabold text-sm">{completedCount}</span> SKU
              </p>
              
              <div className="flex justify-center shrink-0">
                <button 
                  onClick={() => {
                    handleLogout();
                    playSound("click");
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-xl font-bold text-sm transition active:scale-95 shadow-lg shadow-red-950/40 border border-red-500/30"
                >
                  Выйти из аккаунта
                </button>
              </div>
            </div>
          )}

          {!error && !(activeMode === "proverka" && showCelebration) && !currentItem && isFetchingBackground && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700">
              <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500 mb-3"></div>
              <h2 className="text-lg font-bold text-white">Загрузка следующего товара...</h2>
              <p className="text-xs text-neutral-400 mt-1">Подождите.</p>
            </div>
          )}

          {!error && !(activeMode === "proverka" && showCelebration) && !currentItem && !isFetchingBackground && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700 p-4">
              <h2 className="text-2xl font-black text-amber-400">
                ⚠️ Для этажа {selectedFloor} {activeMode === "izlishka" ? "нет излишков" : "нет доступных SKU"}
              </h2>
              <p className="text-xs text-neutral-400 mt-2">
                {selectedFloor === "СГТ" ? "В листе 'СГТ' больше нет невыполненных товаров." : (activeMode === "izlishka" ? "В листе 'излишка' больше нет невыполненных товаров для этого этажа." : "В таблице больше нет товаров для проверки на этом этаже.")}
              </p>
              <button 
                onClick={() => {
                  fetchItems(false, selectedFloor, shift, activeMode);
                  playSound("click");
                }}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm transition active:scale-95"
              >
                Обновить
              </button>
            </div>
          )}

          {!error && !(activeMode === "proverka" && showCelebration) && currentItem && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Top part: Item Info (Larger fonts, scrollable name, optional image) */}
              <div className="flex-1 flex gap-3 min-h-0 overflow-hidden mb-1.5 md:mb-2.5">
                {/* Left details */}
                <div className="flex-1 bg-neutral-800 rounded-xl p-2.5 md:p-3.5 border border-neutral-700 flex flex-col overflow-y-auto shadow-lg">
                  <div className="flex justify-between items-center shrink-0 border-b border-neutral-700/50 pb-2">
                    <div>
                      <p className="text-neutral-400 text-[10px] md:text-xs font-bold uppercase tracking-wider">Ячейка</p>
                      <h1 className="text-3xl md:text-5xl font-black text-amber-400 leading-none truncate mt-0.5">{currentItem.location}</h1>
                    </div>

                    {/* Barcode scanning status indicator */}
                    <div className="flex items-center gap-2">
                      {isScanned ? (
                        <span className="text-[10px] md:text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 md:px-3 py-1 md:py-1.5 rounded-lg font-black uppercase tracking-wider">
                          🟢 Сканирован
                        </span>
                      ) : (
                        <span className="text-[9px] md:text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 md:px-2.5 py-1 md:py-1.5 rounded-lg font-black uppercase tracking-wider animate-pulse">
                          🔴 Ожидание сканирования
                        </span>
                      )}
                    </div>

                    <div className="bg-blue-500/10 rounded-lg px-2 md:px-3.5 py-0.5 md:py-1 border border-blue-500/20 text-center shrink-0">
                      <span className="block text-neutral-400 text-[9px] md:text-[10px] font-bold uppercase">Кол-во</span>
                      <span className="text-lg md:text-xl font-black text-blue-400 block mt-0.5">{currentItem.qty} шт</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 my-2 shrink-0">
                    <div className="bg-neutral-700/30 rounded-lg px-3 py-1.5 border border-neutral-700/50 flex flex-col justify-between truncate">
                      <div>
                        <span className="block text-neutral-400 text-[10px] md:text-xs font-bold uppercase">Штрихкод (Требуется)</span>
                        <span className="font-mono text-sm md:text-base font-bold text-neutral-300 block mt-0.5 truncate">
                          {(() => {
                            const barcodeStr = String(currentItem.barcode || "");
                            if (barcodeStr.length <= 4) {
                              return <span className="text-lg md:text-xl font-black text-yellow-300">{barcodeStr}</span>;
                            }
                            const firstPart = barcodeStr.slice(0, -4);
                            const lastPart = barcodeStr.slice(-4);
                            return (
                              <>
                                <span>{firstPart}</span>
                                <span className="text-lg md:text-xl font-black text-yellow-300 bg-yellow-400/10 px-1 py-0.2 rounded border border-yellow-500/20 ml-1 inline-block">
                                  {lastPart}
                                </span>
                              </>
                            );
                          })()}
                        </span>
                      </div>
                      {(currentItem.name || currentItem.barcode || currentProductId) && (
                        <a 
                          href={currentProductId 
                            ? `https://uzum.uz/uz/product/${currentProductId}` 
                            : `https://uzum.uz/uz/search?query=${encodeURIComponent(currentItem.name || currentItem.barcode)}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] md:text-[11px] text-blue-400 hover:text-blue-300 underline block mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {currentProductId ? "🔍 Товар на Uzum" : "🔍 Поиск на Uzum"}
                        </a>
                      )}
                    </div>
                    <div className="bg-neutral-700/30 rounded-lg px-3 py-1.5 border border-neutral-700/50 flex flex-col justify-center truncate">
                      <span className="block text-neutral-400 text-[10px] md:text-xs font-bold uppercase">Категория</span>
                      <span className="text-sm md:text-base font-bold text-white block mt-1 truncate">{currentItem.category}</span>
                    </div>
                  </div>

                  <div className="bg-neutral-900/40 rounded-xl p-2 md:p-2.5 border border-neutral-700/30 shrink-0 mt-1">
                    <span className="block text-neutral-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-1">Наименование товара</span>
                    <p className="text-sm md:text-base font-bold text-neutral-100 leading-snug break-words">
                      {currentItem.name || "Наименование не указано"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom part: Action buttons */}
              <div className="h-12 md:h-16 shrink-0 flex gap-3">
                {activeMode === "izlishka" ? (
                  <>
                    {isScanned ? (
                      <button
                        onClick={() => handleUpdate("Собрано")}
                        className="flex-1 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md font-black text-base uppercase tracking-wider h-full"
                      >
                        <span className="text-lg">📦</span>
                        <span>Взять товар</span>
                      </button>
                    ) : (
                      <button
                        disabled={true}
                        className="flex-1 rounded-xl flex items-center justify-center gap-2 bg-neutral-700 text-neutral-400 cursor-not-allowed font-black text-base uppercase tracking-wider h-full border border-neutral-600"
                      >
                        <span className="text-lg">🔒</span>
                        <span>Сканируйте штрихкод</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleUpdate("Отсутствует")}
                      className="flex-1 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-red-600 hover:bg-red-500 text-white shadow-md font-black text-base uppercase tracking-wider h-full"
                    >
                      <span className="text-lg">❌</span>
                      <span>Товара нет на месте</span>
                    </button>
                  </>
                ) : showPlacementConfirm ? (
                  <div className="w-full flex items-center justify-between gap-4 bg-neutral-800/80 px-3 md:px-4 py-1 md:py-2 rounded-xl border border-neutral-700 h-full">
                    <p className="font-bold text-[10px] md:text-sm text-amber-400 leading-snug truncate max-w-[50%]">
                      Товар размещен правильно по габаритам и категории?
                    </p>
                    <div className="flex gap-2 shrink-0 h-full py-0.5 md:py-1">
                      <button
                        onClick={() => handleUpdate("Подтвержден", "Да")}
                        className="px-10 h-full rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-green-600 hover:bg-green-500 text-white font-black text-sm shadow-md"
                      >
                        Да
                      </button>
                      <button
                        onClick={() => handleUpdate("Подтвержден", "Нет")}
                        className="px-10 h-full rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-md"
                      >
                        Нет
                      </button>
                      <button
                        onClick={() => {
                          setShowPlacementConfirm(false);
                          playSound("click");
                        }}
                        className="px-4 h-full rounded-xl transition-all active:scale-95 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 font-semibold text-xs"
                      >
                        Назад
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {isScanned ? (
                      <button
                        onClick={() => {
                          setShowPlacementConfirm(true);
                          playSound("click");
                        }}
                        className="flex-1 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-green-600 hover:bg-green-500 text-white shadow-md font-black text-base uppercase tracking-wider h-full"
                      >
                        <span className="text-lg">✅</span>
                        <span>Подтвердить</span>
                      </button>
                    ) : (
                      <button
                        disabled={true}
                        className="flex-1 rounded-xl flex items-center justify-center gap-2 bg-neutral-700 text-neutral-400 cursor-not-allowed font-black text-base uppercase tracking-wider h-full border border-neutral-600"
                      >
                        <span className="text-lg">🔒</span>
                        <span>Сканируйте штрихкод</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleUpdate("Отсутствует")}
                      className="flex-1 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-red-600 hover:bg-red-500 text-white shadow-md font-black text-base uppercase tracking-wider h-full"
                    >
                      <span className="text-lg">❌</span>
                      <span>Отсутствует</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {renderOrientationOverlay()}
      {renderStatsModal()}
      {renderGotovaStatsModal()}
      {renderIzlishkaStatsModal()}
    </>
  );
}
