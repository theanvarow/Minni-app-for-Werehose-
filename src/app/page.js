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
  const [selectedAisle, setSelectedAisle] = useState("all");
  
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



  const [isScanned, setIsScanned] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [overrideQuota, setOverrideQuota] = useState(false);
  const DAILY_QUOTA = 93;
  const showCelebration = completedCount >= DAILY_QUOTA && !overrideQuota;

  // PWA states
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  const getAisle = (location) => {
    if (!location) return "Другое";
    const parts = location.split("-");
    if (parts.length > 1) {
      return parts[1];
    }
    const match = location.match(/\d+/);
    if (match) {
      // First 2 digits as aisle fallback (e.g. D0102 -> "01")
      return match[0].substring(0, 2);
    }
    return "Другое";
  };

  const availableAisles = Array.from(
    new Set(itemQueue.map(item => getAisle(item.location)))
  ).sort();

  const filteredQueue = itemQueue.filter(item => {
    if (selectedAisle === "all") return true;
    return getAisle(item.location) === selectedAisle;
  });

  const currentItem = filteredQueue.length > 0 ? filteredQueue[0] : null;

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
      playSound("success");
      setIsScanned(true);
      setShowPlacementConfirm(true); // Automatically show dimension confirmation
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
    if (storedName) {
      setUserName(storedName);
      setShift(storedShift || "");
      setIsLoggedIn(true);
      
      const todayStr = new Date().toISOString().split('T')[0];
      const storedCount = localStorage.getItem(`audit_count_${storedName}_${todayStr}`);
      setCompletedCount(storedCount ? parseInt(storedCount, 10) : 0);

      if (storedFloor) {
        setSelectedFloor(storedFloor);
        fetchItems(false, storedFloor, storedShift || "");
      } else {
        setLoading(false); // Show floor selection screen
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
      setOverrideQuota(false);

      // Clear floor to force selection after login
      localStorage.removeItem("selectedFloor");
      setSelectedFloor("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userName");
    localStorage.removeItem("shift");
    localStorage.removeItem("selectedFloor");
    setIsLoggedIn(false);
    setUserName("");
    setShift("");
    setItemQueue([]);
    setShowPlacementConfirm(false);
    setSelectedFloor("");
    setCompletedCount(0);
    setOverrideQuota(false);
  };

  const handleFloorChange = (newFloor) => {
    localStorage.setItem("selectedFloor", newFloor);
    setSelectedFloor(newFloor);
    setSelectedAisle("all");
    setItemQueue([]);
    verifiedRowsRef.current = new Set();
    if (newFloor) {
      fetchItems(false, newFloor, shift);
    }
  };

  const verifiedRowsRef = useRef(new Set());

  const fetchItems = async (isBackground = false, targetFloor = selectedFloor, targetShift = shift) => {
    if (isFetchingBackground) return;
    
    try {
      if (!isBackground) {
        setLoading(true);
      } else {
        setIsFetchingBackground(true);
      }
      setError("");
      
      const res = await fetch(`/api/inventory?floor=${targetFloor}&shift=${encodeURIComponent(targetShift + " смена")}&t=${Date.now()}`);
      const data = await res.json();

      if (data.success) {
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
                fetchItems(true, targetFloor, targetShift);
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

  const fetchStats = async () => {
    setLoadingStats(true);
    setStatsError("");
    try {
      const res = await fetch(`/api/inventory?action=stats&t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        if (data.stats) {
          setStatsData(data.stats);
        } else {
          setStatsError("Пожалуйста, обновите Google Apps Script до последней версии (внедрите код статистики и сделайте New Version Deployment).");
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

  const fetchGotovaStats = async () => {
    setLoadingGotovaStats(true);
    setGotovaStatsError("");
    try {
      const res = await fetch(`/api/inventory?action=gotova_stats&t=${Date.now()}`);
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

    if (status === "Подтвержден") {
      playSound("success");
    } else if (status === "Отсутствует") {
      playSound("warning");
    }

    // Mark as verified so we don't fetch it again while backend is syncing
    verifiedRowsRef.current.add(currentItem.rowIndex);

    // OPTIMISTIC UI: Immediately remove the item from the queue to show the next one
    setItemQueue(prevQueue => prevQueue.filter(item => item.rowIndex !== currentItem.rowIndex));
    setShowPlacementConfirm(false);

    // Increment and save today's count
    setCompletedCount(prev => {
      const nextCount = prev + 1;
      const todayStr = new Date().toISOString().split('T')[0];
      localStorage.setItem(`audit_count_${userName}_${todayStr}`, nextCount.toString());
      return nextCount;
    });

    // If queue is getting low (< 3), fetch more in the background
    if (itemQueue.length - 1 <= 3) {
      fetchItems(true, selectedFloor, shift);
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
          timestamp: formattedTimestamp
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
                                            {Object.keys(users).map((u) => (
                                              <div key={u} className="flex justify-between items-center text-neutral-200 py-0.5">
                                                <span className="font-bold text-neutral-100 truncate max-w-[75%]" title={u}>{u}</span>
                                                <span className="font-mono text-amber-400 font-black text-[9px] bg-amber-500/10 px-1 py-0.5 rounded">{users[u]} шт</span>
                                              </div>
                                            ))}
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



  const renderOrientationOverlay = () => {
    return (
      <div className="fixed inset-0 bg-neutral-950 z-[9999] flex flex-col items-center justify-center p-6 text-center portrait:flex landscape:hidden font-sans">
        <div className="mb-8 p-6 bg-neutral-900 rounded-3xl border border-neutral-800 shadow-2xl relative">
          <div className="animate-rotate-phone inline-block origin-center">
            <svg 
              className="w-20 h-32 text-amber-400" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5"
            >
              <rect x="5" y="2" width="14" height="20" rx="3" />
              <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-40">
            <svg className="w-24 h-24 text-neutral-700 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M12 2v20M5 9l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-wide">
          Поверните устройство!
        </h2>
        <p className="text-amber-400 font-bold mb-4 text-base">
          Поверните устройство горизонтально
        </p>
        <p className="text-neutral-400 text-xs max-w-xs leading-relaxed">
          Приложение работает только в альбомном (горизонтальном) режиме. Пожалуйста, убедитесь, что на вашем устройстве включена **авторотация**.
        </p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-900 text-white">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <div className="w-screen h-[100dvh] bg-neutral-900 text-white p-4 font-sans flex items-center justify-center overflow-hidden">
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
            <div className="mt-4 pt-3 border-t border-neutral-700 flex justify-center gap-3.5 items-center">
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
      </>
    );
  }

  if (isLoggedIn && !selectedFloor) {
    return (
      <>
        <div className="w-screen h-[100dvh] bg-neutral-900 text-white p-4 font-sans flex items-center justify-center overflow-hidden">
          {/* Main Container */}
          <div className="w-full max-w-md bg-neutral-800 rounded-2xl shadow-2xl p-6 border border-neutral-700 flex flex-col">
            
            {/* Header: Title and Subtitle */}
            <div className="mb-2">
              <h1 className="text-2xl font-black text-amber-400">Выберите этаж</h1>
              <p className="text-neutral-400 text-xs mt-0.5">Укажите этаж для проверки товаров</p>
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
                  className="px-2.5 py-2.5 bg-neutral-850 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition active:scale-95"
                >
                  📊 Статистика
                </button>
                <button
                  onClick={() => {
                    setShowGotovaStats(true);
                    fetchGotovaStats();
                    playSound("click");
                  }}
                  className="px-2.5 py-2.5 bg-purple-950/40 hover:bg-purple-900 border border-purple-800/80 text-purple-300 hover:text-white rounded-xl text-xs font-bold transition active:scale-95"
                >
                  📈 Аналитика
                </button>
                <button 
                  onClick={() => {
                    handleLogout();
                    playSound("click");
                  }} 
                  className="px-4 py-2.5 bg-red-900/80 border border-red-500 text-white hover:bg-red-800 rounded-xl text-sm font-black transition active:scale-95 shadow-md shadow-red-900/30"
                >
                  Выйти
                </button>
              </div>
            </div>

            {/* Floor selector buttons */}
            <div className="grid grid-cols-3 gap-3">
              {["M1", "M2", "M3", "M4", "M5"].map((floorVal) => (
                <button
                  key={floorVal}
                  onClick={() => {
                    handleFloorChange(floorVal);
                    playSound("click");
                  }}
                  className="py-5 rounded-2xl font-black text-2xl transition-all active:scale-95 bg-neutral-700 text-neutral-200 hover:bg-amber-500 hover:text-neutral-900 border border-neutral-600 hover:border-amber-400 shadow-md"
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
      </>
    );
  }

  return (
    <>
      <div className="w-screen h-[100dvh] bg-neutral-900 text-white p-1.5 md:p-3 font-sans flex flex-col overflow-hidden select-none">
        
        {/* Header bar showing user and logout */}
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
                className="text-[11px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/30 ml-2 transition active:scale-95"
              >
                Сменить
              </button>
            </span>
            {selectedFloor && availableAisles.length > 0 && (
              <>
                <span className="text-neutral-600">|</span>
                <span className="flex items-center gap-1.5">
                  Ряд: 
                  <select
                    value={selectedAisle}
                    onChange={(e) => {
                      setSelectedAisle(e.target.value);
                      playSound("click");
                    }}
                    className="bg-neutral-850 border border-neutral-700 rounded px-1.5 py-0.5 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold cursor-pointer text-[10px]"
                  >
                    <option value="all">Все ряды</option>
                    {availableAisles.map(aisle => (
                      <option key={aisle} value={aisle}>Ряд {aisle}</option>
                    ))}
                  </select>
                </span>
              </>
            )}
          </div>

          {/* Quota progress bar in the center */}
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
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] bg-neutral-800 px-2.5 py-0.5 rounded text-neutral-400 border border-neutral-700">
              В очереди: <span className="font-bold text-blue-400">{filteredQueue.length}</span>
              {selectedAisle !== "all" && <span className="text-neutral-500 ml-1">({itemQueue.length} всего)</span>}
              {isFetchingBackground && <span className="ml-1.5 animate-pulse text-amber-500">...</span>}
            </span>
            <button
              onClick={() => {
                setShowStats(true);
                fetchStats();
                playSound("click");
              }}
              className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 px-3 py-1 rounded-md border border-blue-500/30 text-xs font-bold transition active:scale-95"
            >
              📊 Статистика
            </button>
            <button
              onClick={() => {
                setShowGotovaStats(true);
                fetchGotovaStats();
                playSound("click");
              }}
              className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 px-3 py-1 rounded-md border border-purple-500/30 text-xs font-bold transition active:scale-95"
            >
              📈 Аналитика
            </button>
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

          {!error && showCelebration && (
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

          {!error && !showCelebration && !currentItem && isFetchingBackground && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700">
              <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500 mb-3"></div>
              <h2 className="text-lg font-bold text-white">Загрузка следующего товара...</h2>
              <p className="text-xs text-neutral-400 mt-1">Подождите.</p>
            </div>
          )}

          {!error && !showCelebration && !currentItem && !isFetchingBackground && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700 p-4">
              {selectedAisle !== "all" && itemQueue.length > 0 ? (
                <>
                  <h2 className="text-2xl font-black text-amber-400">⚠️ В Ряду {selectedAisle} нет доступных SKU</h2>
                  <p className="text-xs text-neutral-400 mt-2">Все товары в этом ряду уже проверены. Пожалуйста, выберите другой ряд.</p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-black text-amber-400">⚠️ Для этажа {selectedFloor} нет доступных SKU</h2>
                  <p className="text-xs text-neutral-400 mt-2">В таблице больше нет товаров для проверки на этом этаже.</p>
                  <button 
                    onClick={() => {
                      fetchItems(false, selectedFloor, shift);
                      playSound("click");
                    }}
                    className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm transition active:scale-95 animate-pulse"
                  >
                    Обновить
                  </button>
                </>
              )}
            </div>
          )}

          {!error && !showCelebration && currentItem && (
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
                        <span className="font-mono text-sm md:text-base font-bold text-white block mt-0.5 truncate">{currentItem.barcode}</span>
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

              {/* Bottom part: Action buttons (Compact row but with large buttons) */}
              <div className="h-12 md:h-16 shrink-0 flex gap-3">
                {showPlacementConfirm ? (
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
    </>
  );
}
