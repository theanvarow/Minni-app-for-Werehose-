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

  const [productImage, setProductImage] = useState("");
  const [loadingImage, setLoadingImage] = useState(false);

  const [isScanned, setIsScanned] = useState(false);

  // PWA states
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  const currentItem = itemQueue.length > 0 ? itemQueue[0] : null;

  // Scanner barcode input buffer
  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  useEffect(() => {
    setIsScanned(false);
    setShowPlacementConfirm(false);
  }, [currentItem]);

  useEffect(() => {
    if (!currentItem) {
      setProductImage("");
      return;
    }

    if (currentItem.image) {
      setProductImage(currentItem.image);
      return;
    }

    if (currentItem.productId) {
      setLoadingImage(true);
      setProductImage("");
      fetch(`https://api.uzum.uz/api/v2/product/${currentItem.productId}`)
        .then(res => res.json())
        .then(resData => {
          if (resData.success && resData.payload && resData.payload.data && resData.payload.data.photos && resData.payload.data.photos.length > 0) {
            const photoObj = resData.payload.data.photos[0].photo;
            const imgUrl = photoObj["480"]?.high || photoObj["240"]?.high || "";
            setProductImage(imgUrl);
          }
        })
        .catch(err => console.error("Error fetching product image:", err))
        .finally(() => setLoadingImage(false));
    } else {
      setProductImage("");
    }
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
      if (storedFloor) {
        setSelectedFloor(storedFloor);
        fetchItems(false, storedFloor);
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
    if (nameInput.trim().length > 2) {
      localStorage.setItem("userName", nameInput.trim());
      localStorage.setItem("shift", shiftInput);
      setUserName(nameInput.trim());
      setShift(shiftInput);
      setIsLoggedIn(true);
      
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
  };

  const handleFloorChange = (newFloor) => {
    localStorage.setItem("selectedFloor", newFloor);
    setSelectedFloor(newFloor);
    setItemQueue([]);
    verifiedRowsRef.current = new Set();
    if (newFloor) {
      fetchItems(false, newFloor);
    }
  };

  const verifiedRowsRef = useRef(new Set());

  const fetchItems = async (isBackground = false, targetFloor = selectedFloor) => {
    if (isFetchingBackground) return;
    
    try {
      if (!isBackground) {
        setLoading(true);
      } else {
        setIsFetchingBackground(true);
      }
      setError("");
      
      const res = await fetch(`/api/inventory?floor=${targetFloor}&t=${Date.now()}`);
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
                fetchItems(true, targetFloor);
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

  const handleUpdate = async (status, placementCorrect = "") => {
    if (itemQueue.length === 0) return;

    if (status === "Подтвержден") {
      playSound("success");
    } else if (status === "Отсутствует") {
      playSound("warning");
    }

    // Get the current item from the top of the queue
    const currentItem = itemQueue[0];
    
    // Mark as verified so we don't fetch it again while backend is syncing
    verifiedRowsRef.current.add(currentItem.rowIndex);

    // OPTIMISTIC UI: Immediately remove the item from the queue to show the next one
    setItemQueue(prevQueue => prevQueue.slice(1));
    setShowPlacementConfirm(false);

    // If queue is getting low (< 3), fetch more in the background
    if (itemQueue.length - 1 <= 3) {
      fetchItems(true, selectedFloor);
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
          </div>
        </div>
        {renderOrientationOverlay()}
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
              <button 
                onClick={() => {
                  handleLogout();
                  playSound("click");
                }} 
                className="px-5 py-2.5 bg-red-900/80 border border-red-500 text-white hover:bg-red-800 rounded-xl text-sm font-black transition active:scale-95 shadow-md shadow-red-900/30"
              >
                Выйти
              </button>
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
      </>
    );
  }

  return (
    <>
      <div className="w-screen h-[100dvh] bg-neutral-900 text-white p-3 font-sans flex flex-col overflow-hidden select-none">
        
        {/* Header bar showing user and logout */}
        <div className="h-10 shrink-0 flex justify-between items-center w-full px-2 border-b border-neutral-800 mb-2 text-xs">
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
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] bg-neutral-800 px-2.5 py-0.5 rounded text-neutral-400 border border-neutral-700">
              В очереди: <span className="font-bold text-blue-400">{itemQueue.length}</span>
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

          {!currentItem && !error && isFetchingBackground && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700">
              <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500 mb-3"></div>
              <h2 className="text-lg font-bold text-white">Загрузка следующего товара...</h2>
              <p className="text-xs text-neutral-400 mt-1">Подождите.</p>
            </div>
          )}

          {!currentItem && !error && !isFetchingBackground && (
            <div className="w-full text-center bg-neutral-800 rounded-xl flex flex-col items-center justify-center border border-neutral-700 p-4">
              <h2 className="text-2xl font-black text-green-400">✅ Все товары проверены!</h2>
              <p className="text-xs text-neutral-400 mt-2">В таблице больше нет товаров для проверки.</p>
              <button 
                onClick={() => fetchItems()}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm transition active:scale-95"
              >
                Обновить
              </button>
            </div>
          )}

          {currentItem && !error && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Top part: Item Info (Larger fonts, scrollable name, optional image) */}
              <div className="flex-1 flex gap-3 min-h-0 overflow-hidden mb-2.5">
                {/* Left details */}
                <div className="flex-1 bg-neutral-800 rounded-xl p-3.5 border border-neutral-700 flex flex-col justify-between overflow-hidden shadow-lg">
                  <div className="flex justify-between items-center shrink-0 border-b border-neutral-700/50 pb-2">
                    <div>
                      <p className="text-neutral-400 text-xs font-bold uppercase tracking-wider">Ячейка</p>
                      <h1 className="text-4xl md:text-5xl font-black text-amber-400 leading-none truncate mt-0.5">{currentItem.location}</h1>
                    </div>

                    {/* Barcode scanning status indicator */}
                    <div className="flex items-center gap-2">
                      {isScanned ? (
                        <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider">
                          🟢 Сканирован
                        </span>
                      ) : (
                        <span className="text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider animate-pulse">
                          🔴 Ожидание сканирования
                        </span>
                      )}
                    </div>

                    <div className="bg-blue-500/10 rounded-lg px-3.5 py-1 border border-blue-500/20 text-center shrink-0">
                      <span className="block text-neutral-400 text-[10px] font-bold uppercase">Кол-во</span>
                      <span className="text-xl font-black text-blue-400 block mt-0.5">{currentItem.qty} шт</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 my-2 shrink-0">
                    <div className="bg-neutral-700/30 rounded-lg px-3 py-1.5 border border-neutral-700/50 flex flex-col justify-between truncate">
                      <div>
                        <span className="block text-neutral-400 text-xs font-bold uppercase">Штрихкод (Требуется)</span>
                        <span className="font-mono text-base font-bold text-white block mt-0.5 truncate">{currentItem.barcode}</span>
                      </div>
                      {currentItem.name && (
                        <a 
                          href={`https://uzum.uz/uz/search?query=${encodeURIComponent(currentItem.name)}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline block mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔍 Поиск на Uzum
                        </a>
                      )}
                    </div>
                    <div className="bg-neutral-700/30 rounded-lg px-3 py-1.5 border border-neutral-700/50 flex flex-col justify-center truncate">
                      <span className="block text-neutral-400 text-xs font-bold uppercase">Категория</span>
                      <span className="text-base font-bold text-white block mt-1 truncate">{currentItem.category}</span>
                    </div>
                  </div>

                  <div className="bg-neutral-900/40 rounded-xl p-2.5 border border-neutral-700/30 flex-1 overflow-y-auto min-h-0">
                    <span className="block text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Наименование товара</span>
                    <p className="text-base md:text-lg font-bold text-neutral-100 leading-snug break-words">{currentItem.name}</p>
                  </div>
                </div>

                {/* Right product image */}
                {(productImage || loadingImage) && (
                  <div className="w-[30%] bg-neutral-800 rounded-xl border border-neutral-700 flex items-center justify-center overflow-hidden shadow-lg p-1.5 relative shrink-0">
                    {loadingImage ? (
                      <div className="animate-pulse flex flex-col items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-amber-400 mb-2"></div>
                        <span className="text-[10px] text-neutral-400">Фото...</span>
                      </div>
                    ) : (
                      <img 
                        src={productImage} 
                        alt="Product" 
                        className="max-w-full max-h-full object-contain rounded-lg"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Bottom part: Action buttons (Compact row but with large buttons) */}
              <div className="h-16 shrink-0 flex gap-3">
                {showPlacementConfirm ? (
                  <div className="w-full flex items-center justify-between gap-4 bg-neutral-800/80 px-4 py-2 rounded-xl border border-neutral-700 h-full">
                    <p className="font-bold text-xs md:text-sm text-amber-400 leading-snug truncate max-w-[50%]">
                      Товар размещен правильно по габаритам и категории?
                    </p>
                    <div className="flex gap-2 shrink-0 h-full py-1">
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
    </>
  );
}
